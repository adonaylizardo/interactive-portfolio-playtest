/**
 * Persona round-3/4 evidence — run against deployed /preview-persona/ (real bundle).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
const FRAMES = path.join(ROOT, 'art', 'primera-persona', 'frames');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const EXPECT_BUNDLE = process.argv[3] ?? 'index-By5KgPBy.js';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

function sideBySide(oursPath, refPath, destPath) {
  const ours = PNG.sync.read(fs.readFileSync(oursPath));
  if (!fs.existsSync(refPath)) {
    fs.copyFileSync(oursPath, destPath);
    return { ok: false, note: 'missing ref', meanDiff: 999 };
  }
  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const scale = (img, height) => {
    if (img.height === height) return img;
    const w = Math.max(1, Math.round((img.width * height) / img.height));
    const out = new PNG({ width: w, height });
    for (let y = 0; y < height; y++) {
      const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor((x * img.width) / w));
        const si = (sy * img.width + sx) * 4;
        const di = (y * w + x) * 4;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = img.data[si + 3];
      }
    }
    return out;
  };
  const h = Math.max(ours.height, ref.height);
  const a = scale(ref, h);
  const b = scale(ours, h);
  let diff = 0;
  const w = Math.min(a.width, b.width);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ai = (y * a.width + x) * 4;
      const bi = (y * b.width + x) * 4;
      diff += Math.abs(a.data[ai] - b.data[bi]) + Math.abs(a.data[ai + 1] - b.data[bi + 1]);
    }
  }
  const gap = 12;
  const out = new PNG({ width: a.width + gap + b.width, height: h });
  out.data.fill(20);
  const blit = (src, ox) => {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + ox + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  };
  blit(a, 0);
  blit(b, a.width + gap);
  fs.writeFileSync(destPath, PNG.sync.write(out));
  const meanDiff = diff / (w * h * 3);
  return { ok: true, meanDiff };
}

async function avgFps(page, seconds, warmupMs = 2000) {
  await wait(warmupMs);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    samples.push((await page.evaluate(() => window.__playtestQa.fps())).fps);
    await wait(200);
  }
  return samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
}

async function uiLeakCheck(page) {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll('.name-label, .name-labels')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).length;
    const cenitalLabels = [...document.querySelectorAll('.cenital-building-label')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).length;
    const checklistExpanded = document.querySelector('.checklist:not(.checklist--mobile-closed)');
    const cl = checklistExpanded?.getBoundingClientRect();
    const checklistBig = cl && cl.width > 80 && cl.height > 80;
    return { labels, cenitalLabels, checklistBig: !!checklistBig };
  });
}

async function overlapProbe(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const hit = (a, b) => a && b && a.l < b.r - 2 && a.r > b.l + 2 && a.t < b.b - 2 && a.b > b.t + 2;
    const canvas = document.getElementById('game-canvas');
    const cr = canvas?.getBoundingClientRect();
    const feetY = window.__playtestQa.personaScreenMetrics?.()?.feetY ?? NaN;
    const adonay = cr && Number.isFinite(feetY) ? { l: cr.left + cr.width * 0.35, t: feetY - 120, r: cr.left + cr.width * 0.65, b: feetY + 8 } : null;
    const enter = box('.persona-enter-prompt:not([hidden]) [data-persona-enter]');
    const jac = box('.persona-jac-board:not([hidden]) [data-persona-jac="in"]');
    const views = box('.chrome__view-btns');
    const dock = box('.chrome__dock');
    const joy = box('.joystick:not([hidden])');
    return {
      adonayVsEnter: hit(adonay, enter),
      adonayVsJac: hit(adonay, jac),
      adonayVsViews: hit(adonay, views),
      adonayVsDock: hit(adonay, dock),
      adonayVsJoy: hit(adonay, joy),
      jacVsDock: hit(jac, dock),
      viewsVsJacBoard: hit(views, jac),
    };
  });
}

async function viewSwitchPreservesTile(page) {
  await page.evaluate(() => {
    window.__playtestQa.setViewMode('persona');
    window.__playtestQa.setCharacterTile(22, 22);
  });
  await wait(200);
  const before = await page.evaluate(() => window.__playtestQa.getCharacterTile());
  await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
  await wait(150);
  await page.evaluate(() => window.__playtestQa.setViewMode('isometrica'));
  await wait(150);
  await page.evaluate(() => window.__playtestQa.setViewMode('persona'));
  await wait(200);
  const after = await page.evaluate(() => window.__playtestQa.getCharacterTile());
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  return { before, after, moved, pass: moved < 0.01 };
}

async function boot(page, touch) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.flushPersonaView), null, { timeout: 90000 });
  await page.evaluate((layout) => {
    window.__playtestQa.setLayout?.(layout);
    window.__playtestQa.leaveInteriorNow?.();
    window.__playtestQa.dismissBuildingPanel?.();
  }, touch ? 'split' : 'map');
}

async function runViewport(tag, vp) {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await ctx.newPage();
  await boot(page, vp.touch);
  const bundle =
    (await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
    ))?.split('/').pop() ?? '';

  await page.evaluate(() => window.__playtestQa.setViewMode('isometrica'));
  await wait(400);
  const mapFps = await avgFps(page, 4, 1500);

  await page.evaluate(() => {
    window.__playtestQa.setViewMode('persona');
    window.__playtestQa.setCharacterTile(27, 18);
    window.__playtestQa.setPersonaYawDeg(40);
  });
  await wait(1200);
  const metrics = await page.evaluate(async () => {
    window.__playtestQa.setCharacterTile(27, 18);
    window.__playtestQa.setPersonaYawDeg(40);
    await window.__playtestQa.flushPersonaView?.();
    return window.__playtestQa.personaScreenMetrics();
  });
  const personaFps = await avgFps(page, 4, 2000);
  const fpsRatio = personaFps / Math.max(0.1, mapFps);

  await page.screenshot({ path: path.join(OUT, `${tag}-round3-frame-c.png`) });
  const frameC = sideBySide(
    path.join(OUT, `${tag}-round3-frame-c.png`),
    path.join(FRAMES, 'frame-c-a-pie-junto-t9@1x.png'),
    path.join(OUT, `${tag}-round3-vs-frame-c.png`),
  );
  const frameCPass = frameC.ok && (frameC.meanDiff ?? 999) <= 58;

  const leak = await uiLeakCheck(page);
  const overlaps = await overlapProbe(page);

  const expectedAdonayH = ADONAY_ALTO_PX_1X * (metrics.sh / 720);
  const adonayScaleOk = Math.abs(metrics.adonayHeightPx - expectedAdonayH) / expectedAdonayH < 0.12;
  const t9Ok =
    Number.isFinite(metrics.t9WidthFrac) && metrics.t9WidthFrac >= 0.22 && metrics.t9WidthFrac <= 0.42;
  const legsClear = metrics.feetY <= metrics.sh - 12;
  const navOverlap = overlaps.adonayVsJac || overlaps.adonayVsEnter || overlaps.jacVsDock;
  const uiOverlapPass = !Object.values(overlaps).some(Boolean);

  const viewSwitch = await viewSwitchPreservesTile(page);

  await ctx.close();
  await browser.close();

  return {
    tag,
    bundle,
    viewSwitch,
    fps: { map: mapFps, persona: personaFps, ratio: fpsRatio, pass: fpsRatio >= 0.8 },
    leak: { ...leak, pass: leak.labels === 0 && leak.cenitalLabels === 0 },
    frameC: { ...frameC, pass: frameCPass },
    metrics,
    adonayScaleOk,
    t9Ok,
    legsClear,
    navOverlap,
    overlaps,
    uiOverlapPass,
  };
}

const ADONAY_ALTO_PX_1X = 288;

const viewports = [
  ['390', { width: 390, height: 844, touch: true }],
  ['844x390', { width: 844, height: 390, touch: true }],
  ['1280', { width: 1280, height: 800, touch: false }],
];

const results = [];
for (const [tag, vp] of viewports) {
  console.log('Evidence', tag);
  results.push(await runViewport(tag, vp));
}

const bundleOk = results.every((r) => r.bundle === EXPECT_BUNDLE);
const report = {
  base: BASE,
  expectBundle: EXPECT_BUNDLE,
  bundleOk,
  at: new Date().toISOString(),
  results,
  ok:
    bundleOk &&
    results.every(
      (r) =>
        r.viewSwitch.pass &&
        r.leak.pass &&
        r.frameC.pass &&
        r.adonayScaleOk &&
        r.t9Ok &&
        r.legsClear &&
        r.uiOverlapPass,
    ),
};

fs.writeFileSync(path.join(OUT, 'round3-evidence.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
