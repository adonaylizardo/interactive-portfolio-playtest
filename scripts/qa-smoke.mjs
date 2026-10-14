#!/usr/bin/env node
/**
 * Fast real-input smoke (deploy gate, ~5 min): Chromium desktop + phone and WebKit iPhone.
 *  - first load: 1280×800 centred on the character, phones frame the Estudio and Volaris doors
 *  - a door tap walks there and enters only on arrival
 *  - one tap on the exit mat or the door gap leaves each of the 9 rooms without walking first
 *    (<= 700 ms in-page, or <= 6 rendered frames and 1.5 s on software-GL runners)
 *  - LOD: detailed (cerca) sprites at every first load; lejos only in the last ×2 of zoom-out
 *  - keyboard door entry, wheel pan / pinch zoom, Sambil + Flor tap feel (qa-run41-input.mjs)
 *  - camera follow: long walk stays centred at 1280 and 375, drag suspends, zoom mid-walk (qa-run42-follow.mjs)
 *  - "Worked with" logo strip: equal heights, wraps without overflow, gray by default and real colours on hover / focus / tap (qa-run43-logos.mjs)
 *  - street NPCs: street tiles only, four directions with idle pauses, no skating, desynced frames, taps pass through (qa-run44-npcs.mjs)
 *  - pixel-art player: facing from movement, frames locked to distance, ~4.5 tiles/s, Pantone one tile behind, Noah's climb (qa-run45-player.mjs)
 *  - airline case panel: headline title, full text on desktop / short on phone, client never named, scrolls (qa-run46-case.mjs)
 *  - map fill: placements clear of streets, footprints and doors, nothing over the Estudio, props block only their cells (qa-run46-fill.mjs)
 * Usage: npm run qa:smoke   (builds first; QA_BASE_URL skips the local preview server)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { installReadyWait } from './qa-ready.mjs';
import { runRun38InputSuite } from './qa-run38-input.mjs';
import { runRun41InputSuite } from './qa-run41-input.mjs';
import { runRun42FollowSuite } from './qa-run42-follow.mjs';
import { runRun43LogoSuite } from './qa-run43-logos.mjs';
import { runRun44NpcSuite } from './qa-run44-npcs.mjs';
import { runRun45PlayerSuite } from './qa-run45-player.mjs';
import { runRun46CaseSuite } from './qa-run46-case.mjs';
import { runRun46FillSuite } from './qa-run46-fill.mjs';

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
        zoomMin: Number(d.zoomMin),
        lod: d.lod,
        lodBelow: Number(d.lodBelow),
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
    if (m.lod !== 'cerca') errors.push(`firstload-${tag}: loads with ${m.lod} sprites at zoom ${m.zoom.toFixed(3)} (want cerca)`);
    if (!(m.lodBelow <= 0.25 + 1e-9 && m.lodBelow <= m.zoomMin * 2 + 1e-9)) {
      errors.push(`firstload-${tag}: lejos threshold ${m.lodBelow} is not within the last ×2 of zoom-out (min ${m.zoomMin})`);
    }
    const lodAt = async (z) => {
      await page.evaluate((zz) => window.__playtestQa.setZoom(zz), z);
      await wait(250);
      return page.evaluate(() => document.getElementById('game-canvas')?.dataset.lod);
    };
    const mid = Math.sqrt(m.zoom * m.zoomMin);
    for (const [z, want] of [[mid, 'cerca'], [m.lodBelow * 1.04, 'cerca'], [m.lodBelow * 0.96, 'lejos'], [m.zoomMin, 'lejos']]) {
      const got = await lodAt(z);
      if (got !== want) errors.push(`firstload-${tag}: zoom ${z.toFixed(3)} shows ${got} (want ${want}; lejos below ${m.lodBelow.toFixed(3)})`);
    }
    notes.push(`firstload ${tag}: zoom ${m.zoom.toFixed(3)} (${m.lod}, lejos below ${m.lodBelow.toFixed(3)}, min ${m.zoomMin.toFixed(3)}), character tile ${m.tile.x},${m.tile.y} at ${Math.round(m.foot.x)},${Math.round(m.foot.y)}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

let preview = null;
if (!process.env.QA_BASE_URL) {
  // Run vite itself (not through npx) so killing `preview` stops the server.
  preview = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
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
  for (const [kind, only] of [
    ['chromium-1280', ['keys', 'wheel', 'interior']],
    ['webkit-1280', ['keys', 'wheel']],
    ['chromium-375', ['interior']],
  ]) {
    await runRun41InputSuite({ kind, base: BASE, errors, notes, only });
  }
  for (const [kind, only] of [
    ['chromium-1280', ['walk', 'pan', 'zoom']],
    ['chromium-375', ['walk', 'pan', 'zoom']],
    ['webkit-1280', ['walk']],
  ]) {
    await runRun42FollowSuite({ kind, base: BASE, errors, notes, only });
  }
  for (const kind of ['chromium-1280', 'webkit-1280', 'chromium-375', 'webkit-iphone']) {
    await runRun43LogoSuite({ kind, base: BASE, errors, notes });
  }
  for (const kind of ['chromium-1280', 'webkit-1280', 'chromium-375']) {
    await runRun44NpcSuite({ kind, base: BASE, errors, notes });
  }
  for (const kind of ['chromium-1280', 'webkit-1280', 'chromium-375']) {
    await runRun45PlayerSuite({ kind, base: BASE, errors, notes });
  }
  for (const kind of ['chromium-1280', 'webkit-1280', 'chromium-375', 'webkit-iphone']) {
    await runRun46CaseSuite({ kind, base: BASE, errors, notes });
  }
  for (const kind of ['chromium-1280', 'webkit-1280', 'chromium-375']) {
    await runRun46FillSuite({ kind, base: BASE, errors, notes });
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
