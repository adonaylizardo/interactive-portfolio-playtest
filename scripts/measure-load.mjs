#!/usr/bin/env node
/**
 * Cold-load timings: time to first map frame, time to interactive, request count, transfer bytes.
 * Usage: node scripts/measure-load.mjs [baseUrl] [--label before|after]
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv.find((a) => /^https?:/.test(a)) ??
  process.env.QA_BASE_URL ??
  'http://127.0.0.1:4196/interactive-portfolio-playtest/';
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  return i >= 0 ? process.argv[i + 1] : 'run';
})();
const OUT_DIR = path.join(ROOT, 'artifacts', 'load');

const FAST_3G = {
  offline: false,
  downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((750 * 1024) / 8),
  latency: 562.5,
};
const FAST_4G = {
  offline: false,
  downloadThroughput: Math.round((9 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((9 * 1024 * 1024) / 8),
  latency: 170,
};

const SPECS = [
  {
    tag: 'desktop-1280',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    network: null,
    cpu: 1,
    mapLeft: 496,
    timeout: 60_000,
  },
  {
    tag: 'iphone-fast-4g',
    ...devices['iPhone 13'],
    network: FAST_4G,
    cpu: 4,
    mapLeft: 0,
    timeout: 90_000,
  },
  {
    tag: 'iphone-fast-3g',
    ...devices['iPhone 13'],
    network: FAST_3G,
    cpu: 4,
    mapLeft: 0,
    timeout: 120_000,
  },
];

function classify(url) {
  const u = url.split('?')[0];
  if (/\/sprites\//.test(u)) return 'sprite';
  if (/fonts\.(googleapis|gstatic)/.test(u) || /\.(woff2?|ttf|otf)(\?|$)/i.test(u)) return 'font';
  if (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(u)) return 'audio';
  if (/\.css(\?|$)/i.test(u)) return 'css';
  if (/\.js(\?|$)/i.test(u)) return 'js';
  if (/\.(png|webp|avif|jpe?g|svg)(\?|$)/i.test(u)) return 'image';
  return 'other';
}

function pngHasMapPixels(buf, mapLeftFrac) {
  const img = PNG.sync.read(buf);
  const BG = [11, 12, 14];
  const far = (i) =>
    Math.abs(img.data[i] - BG[0]) > 18 || Math.abs(img.data[i + 1] - BG[1]) > 18 || Math.abs(img.data[i + 2] - BG[2]) > 18;
  const w = img.width;
  const h = img.height;
  const x0 = Math.floor(w * mapLeftFrac);
  for (let y = Math.floor(h * 0.28); y < h * 0.78; y += 18) {
    for (let x = x0 + Math.floor((w - x0) * 0.15); x < w - 8; x += 18) {
      if (far((y * w + x) * 4)) return true;
    }
  }
  return false;
}

async function measure(spec) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: spec.deviceScaleFactor,
    isMobile: spec.isMobile,
    hasTouch: spec.hasTouch,
    userAgent: spec.userAgent,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (spec.network) await cdp.send('Network.emulateNetworkConditions', spec.network);
  if (spec.cpu && spec.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: spec.cpu });

  const reqs = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.startsWith('data:')) return;
    const headers = res.headers();
    reqs.push({
      url,
      status: res.status(),
      bytes: Number(headers['content-length'] || 0),
      mime: headers['content-type'] || '',
    });
  });

  await page.addInitScript(() => {
    const start = performance.now();
    window.__bootMetrics = { nav: start, tti: null };
    const tick = () => {
      if (window.__bootMetrics.tti == null && window.__playtestQa?.playerAvatar) {
        try {
          if (window.__playtestQa.playerAvatar()?.loaded) {
            window.__bootMetrics.tti = performance.now() - start;
            return;
          }
        } catch {
          /* not ready */
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const t0 = Date.now();
  let navError = null;
  let ttfMs = null;
  const mapLeftFrac = (spec.mapLeft || 0) / (spec.viewport?.width || spec.viewport?.width || 390);
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: spec.timeout });
    const deadline = Date.now() + spec.timeout;
    let ttiSeen = false;
    let atTti = null;
    while (Date.now() < deadline) {
      const m = await page.evaluate(() => window.__bootMetrics).catch(() => null);
      if (m?.tti != null && !ttiSeen) {
        ttiSeen = true;
        atTti = {
          requests: reqs.length,
          bytes: reqs.reduce((n, r) => n + (r.bytes || 0), 0),
          spriteRequests: reqs.filter((r) => classify(r.url) === 'sprite').length,
        };
      }
      if (ttfMs == null) {
        const handle = await page.$('#game-canvas');
        const buf = handle
          ? await handle.screenshot({ type: 'png', animations: 'disabled' })
          : await page.screenshot({ type: 'png', animations: 'disabled' });
        if (pngHasMapPixels(buf, mapLeftFrac)) ttfMs = Date.now() - t0;
      }
      if (m?.tti != null && (ttfMs != null || Date.now() - t0 > m.tti + 800)) break;
      await page.waitForTimeout(50);
    }
    spec._atTti = atTti;
  } catch (err) {
    navError = String(err);
  }
  const wall = Date.now() - t0;
  const metrics = await page.evaluate(() => window.__bootMetrics ?? null).catch(() => null);
  const resources = await page
    .evaluate(() =>
      performance.getEntriesByType('resource').map((e) => ({
        name: e.name,
        encoded: e.encodedBodySize,
        transfer: e.transferSize,
        decoded: e.decodedBodySize,
      })),
    )
    .catch(() => []);
  const qa = await page
    .evaluate(() => {
      const q = window.__playtestQa;
      if (!q) return null;
      const canvas = document.getElementById('game-canvas');
      return {
        tile: q.getCharacterTile(),
        zoom: Number(canvas?.dataset.zoom),
        lod: canvas?.dataset.lod,
        layout: document.body.dataset.layout,
      };
    })
    .catch(() => null);

  const shot = path.join(OUT_DIR, `${LABEL}-${spec.tag}.png`);
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  await browser.close();

  const rtBy = {};
  let rtEncoded = 0;
  let rtTransfer = 0;
  for (const e of resources) {
    const k = classify(e.name);
    rtBy[k] ??= { n: 0, encoded: 0, transfer: 0 };
    rtBy[k].n += 1;
    rtBy[k].encoded += e.encoded || 0;
    rtBy[k].transfer += e.transfer || 0;
    rtEncoded += e.encoded || 0;
    rtTransfer += e.transfer || 0;
  }
  const headerBytes = reqs.reduce((n, r) => n + (r.bytes || 0), 0);
  const spriteRequests = reqs.filter((r) => classify(r.url) === 'sprite').length;
  const bytes = headerBytes || rtEncoded || rtTransfer;
  return {
    tag: spec.tag,
    network: spec.network ? (spec.network.latency === 562.5 ? 'Fast 3G' : 'Fast 4G') : 'unthrottled',
    cpu: spec.cpu,
    ttfMs,
    ttiMs: metrics?.tti ?? null,
    wallMs: wall,
    requests: reqs.length,
    encodedBytes: bytes,
    contentLengthBytes: headerBytes,
    resourceEncoded: rtEncoded,
    resourceTransfer: rtTransfer,
    resourceByType: rtBy,
    spriteRequests: spec._atTti?.spriteRequests ?? spriteRequests,
    requestsAtTti: spec._atTti?.requests ?? reqs.length,
    bytesAtTti: spec._atTti?.bytes ?? headerBytes,
    requestsUntilClose: reqs.length,
    qa,
    pageErrors: errors,
    error: navError,
    shot,
  };
}

mkdirSync(OUT_DIR, { recursive: true });
const results = [];
for (const spec of SPECS) {
  console.log(`measuring ${spec.tag}…`);
  const r = await measure(spec);
  results.push(r);
  const reqN = r.requestsAtTti ?? r.requests;
  const mb = ((r.bytesAtTti ?? r.encodedBytes) / 1024 / 1024).toFixed(2);
  console.log(
    `  TTF ${r.ttfMs == null ? '—' : `${(r.ttfMs / 1000).toFixed(2)}s`}  TTI ${
      r.ttiMs == null ? '—' : `${(r.ttiMs / 1000).toFixed(2)}s`
    }  req ${reqN}  ${mb} MB  sprites ${r.spriteRequests}${r.error ? `  ERR ${r.error}` : ''}${
      r.pageErrors?.length ? `  PAGE ${r.pageErrors[0]}` : ''
    }`,
  );
}

const out = { label: LABEL, base: BASE, at: new Date().toISOString(), results };
const jsonPath = path.join(OUT_DIR, `${LABEL}.json`);
writeFileSync(jsonPath, JSON.stringify(out, null, 2));
console.log(`wrote ${jsonPath}`);
