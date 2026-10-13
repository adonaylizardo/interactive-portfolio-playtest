#!/usr/bin/env node
/**
 * Fast real-input smoke (deploy gate, ~5 min): Chromium desktop + phone and WebKit iPhone.
 *  - first load: 1280×800 centred on the character, phones frame the Estudio and Volaris doors
 *  - a door tap walks there and enters only on arrival
 *  - one tap on the exit mat or the door gap leaves each of the 9 rooms within 700 ms
 * Usage: npm run qa:smoke   (builds first; QA_BASE_URL skips the local preview server)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { installReadyWait } from './qa-ready.mjs';
import { runRun38InputSuite } from './qa-run38-input.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4194;
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${PREVIEW_PORT}/interactive-portfolio-playtest/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const notes = [];

const FIRST_LOAD = [
  { tag: 'chromium-1280', type: chromium, options: { viewport: { width: 1280, height: 800 } }, minZoom: 0.45, centred: true },
  { tag: 'webkit-1280', type: webkit, options: { viewport: { width: 1280, height: 800 } }, minZoom: 0.45, centred: true },
  {
    tag: 'chromium-375',
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    minZoom: 0.28,
  },
  { tag: 'webkit-iphone', type: webkit, options: { ...devices['iPhone 13'] }, minZoom: 0.28 },
];

/** Character on screen near the middle, zoom in range, Estudio and Volaris doors in view. */
async function firstLoad({ tag, type, options, minZoom, centred }) {
  const browser = installReadyWait(await type.launch());
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(1200);
    const m = await page.evaluate(() => {
      const qa = window.__playtestQa;
      const d = document.getElementById('game-canvas')?.dataset ?? {};
      const t = qa.getCharacterTile();
      const foot = qa.worldToClient((t.x - t.y) * 64, (t.x + t.y) * 32 + 32);
      return {
        zoom: Number(d.zoom),
        w: innerWidth,
        h: innerHeight,
        tile: t,
        foot,
        estudio: qa.doorScreenPoint('estudio'),
        volaris: qa.doorScreenPoint('volaris'),
      };
    });
    if (!(m.zoom >= minZoom && m.zoom <= 1.0)) errors.push(`firstload-${tag}: zoom ${m.zoom} outside ${minZoom}..1`);
    const dx = Math.abs(m.foot.x - m.w / 2) / m.w;
    const dy = Math.abs(m.foot.y - m.h / 2) / m.h;
    if (centred && (dx > 0.15 || dy > 0.2)) {
      errors.push(`firstload-${tag}: character at ${Math.round(m.foot.x)},${Math.round(m.foot.y)} is not near the centre of ${m.w}x${m.h}`);
    }
    if (m.foot.x < 8 || m.foot.x > m.w - 8 || m.foot.y < 60 || m.foot.y > m.h - 60) {
      errors.push(`firstload-${tag}: character off screen at ${Math.round(m.foot.x)},${Math.round(m.foot.y)}`);
    }
    for (const key of ['estudio', 'volaris']) {
      const pt = m[key];
      if (!pt || pt.x < 8 || pt.x > m.w - 8 || pt.y < 40 || pt.y > m.h - 40) {
        errors.push(`firstload-${tag}: ${key} door not in view ${JSON.stringify(pt)}`);
      }
    }
    notes.push(`firstload ${tag}: zoom ${m.zoom.toFixed(3)}, character tile ${m.tile.x},${m.tile.y} at ${Math.round(m.foot.x)},${Math.round(m.foot.y)}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

let preview = null;
if (!process.env.QA_BASE_URL) {
  preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  // A stale server on the port would answer with an old build.
  preview.on('exit', (code) => {
    if (code) {
      console.error(`vite preview exited (${code}); is port ${PREVIEW_PORT} already in use?`);
      process.exit(1);
    }
  });
}
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* server not up yet */
  }
  if (i === 59) {
    preview?.kill('SIGKILL');
    console.error(`preview server did not become ready at ${BASE}`);
    process.exit(1);
  }
  await wait(500);
}

const t0 = Date.now();
try {
  for (const spec of FIRST_LOAD) await firstLoad(spec);
  for (const kind of ['chromium-desktop', 'webkit-iphone', 'chromium-phone']) {
    const before = errors.length;
    const only = kind === 'chromium-phone' ? ['exit'] : ['exit', 'door'];
    await runRun38InputSuite({ kind, base: BASE, errors, only });
    notes.push(`${kind}: ${only.join(' + ')} ${errors.length === before ? 'ok' : `${errors.length - before} failure(s)`}`);
  }
} finally {
  preview?.kill('SIGKILL');
}

for (const n of notes) console.log(`note: ${n}`);
console.log(`qa-smoke: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  console.error(`\n${errors.length} smoke check(s) failed`);
  process.exit(1);
}
console.log('qa-smoke: all checks passed');
