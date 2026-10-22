#!/usr/bin/env node
/**
 * Fast real-input smoke (deploy gate; ~20 min in one process, CI runs GROUPS as parallel shards): Chromium desktop + phone and WebKit iPhone.
 *  - first load: 1280×800 centred on the character, phones frame the Estudio and Volaris doors
 *  - a door tap walks there and enters only on arrival
 *  - one tap on the exit mat or the door gap leaves each of the 9 rooms without walking first
 *    (<= 700 ms in-page, or <= 6 rendered frames and 1.5 s on software-GL runners)
 *  - LOD: detailed (cerca) sprites at every first load; lejos only in the last ×2 of zoom-out
 *  - keyboard door entry, wheel pan / pinch zoom, Sambil + Flor tap feel (qa-run41-input.mjs)
 *  - camera follow: long walk stays centred at 1280 and 375, drag suspends, zoom mid-walk (qa-run42-follow.mjs)
 *  - "Worked with" logo strip: equal heights, wraps without overflow, gray by default and real colours on hover / focus / tap (qa-run43-logos.mjs)
 *  - NPCs live: walkable tiles only, never idle on door / spawn cells, no skating, desynced frames, gazers / queue / benches / visitors after a fast-forward, taps pass through (qa-run44-npcs.mjs)
 *  - NPC routines: 15 simulated minutes x 4 seeds of stargazers, cart queue, benches, crossers, visitors and strollers around a parked player (qa-run48-routines.mjs)
 *  - pixel-art player: facing from movement, frames locked to distance, ~4.5 tiles/s, Pantone one tile behind, Noah's climb (qa-run45-player.mjs)
 *  - airline case panel: headline title, full text on desktop / short on phone, client never named, scrolls (qa-run46-case.mjs)
 *  - Bain / P&G / Mentoría / Finoa case panels: desktop full vs iPhone short, verbatim, no Volaris/[FALTA] (qa-run55-cases.mjs)
 *  - map fill: placements clear of streets, footprints and doors, nothing over the Estudio, props block only their cells (qa-run46-fill.mjs)
 *  - Estudio "About me": about.md line for line after the logo strip, lazy WebP photos within the panel; Noah's 1.5x tap box on phones (qa-run47-about.mjs)
 *  - bench sit: a tap (or Enter beside it) sits Adonay with Pantone at the manifest offsets, movement gets both up, the
 *    30 s / +15 s rest timer, NPCs keep off the player's bench (qa-run50-bench.mjs)
 * Usage: npm run qa:smoke   (builds first; QA_BASE_URL skips the local preview server)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { isBrowserCrash, launchBrowser, withFreshBrowser } from './qa-ready.mjs';
import { QA_CHROMIUM_ONLY, chromiumOnlyKinds, ciContextOptions } from './qa-ci.mjs';
import { runRun38InputSuite } from './qa-run38-input.mjs';
import { runRun41InputSuite } from './qa-run41-input.mjs';
import { runRun42FollowSuite } from './qa-run42-follow.mjs';
import { runRun43LogoSuite } from './qa-run43-logos.mjs';
import { runRun44NpcSuite } from './qa-run44-npcs.mjs';
import { runRun45PlayerSuite } from './qa-run45-player.mjs';
import { runRun46CaseSuite } from './qa-run46-case.mjs';
import { runRun55CaseSuite, RUN55_KINDS } from './qa-run55-cases.mjs';
import { runRun56LayoutSuite } from './qa-run56-layouts.mjs';
import { runRun46FillSuite } from './qa-run46-fill.mjs';
import { runRun47AboutSuite } from './qa-run47-about.mjs';
import { runRun48RoutineSuite } from './qa-run48-routines.mjs';
import { runRun50BenchSuite, RUN50_KINDS } from './qa-run50-bench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4194;
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${PREVIEW_PORT}/interactive-portfolio-playtest/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const notes = [];

/** Spawn view must not fetch interiors, hover/resaltado, lejos, NPC strips, or voice audio. */
async function firstPaintBudget({ tag, type, options }) {
  const browser = await launchBrowser(type);
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  const early = [];
  const onReq = (req) => {
    const u = req.url();
    if (/\/sprites\/interiores\//.test(u) || /estado-hover|estado-resaltado|_zoom-lejos/.test(u) || /\/sprites\/personaje\/npcs\//.test(u) || /\/audio\//.test(u)) {
      early.push(u);
    }
  };
  try {
    page.on('request', onReq);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    // goto already waited until Start installed the play hooks. The budget
    // covers that welcome, and the town/audio fetches begin after it.
    page.off('request', onReq);
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
    if (early.length) {
      errors.push(`load-${tag}: fetched ${early.length} deferred asset(s) before interactive (${early.slice(0, 3).join(' | ')})`);
    } else {
      notes.push(`load ${tag}: spawn view did not fetch interiors / hover / lejos / npcs / audio`);
    }
  } catch (err) {
    errors.push(`load-${tag}: ${err}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

const FIRST_LOAD = chromiumOnlyKinds([
  { tag: 'chromium-1280', type: chromium, options: { viewport: { width: 1280, height: 800 } }, minZoom: 0.45, centred: true },
  { tag: 'webkit-1280', type: webkit, options: { viewport: { width: 1280, height: 800 } }, minZoom: 0.45, centred: true },
  {
    tag: 'chromium-375',
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    minZoom: 0.28,
  },
  { tag: 'webkit-iphone', type: webkit, options: { ...devices['iPhone 13'] }, minZoom: 0.28 },
]).map((spec) => ({ ...spec, options: ciContextOptions(spec.options) }));

/** Character on screen near the middle, zoom in range, Estudio and Volaris doors in view. */
async function firstLoad({ tag, type, options, minZoom, centred }) {
  await withFreshBrowser(type, {}, async (browser) => {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  try {
    let m;
    try {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
      await wait(400);
      m = await page.evaluate(() => {
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
    } catch (err) {
      if (!isBrowserCrash(err) || !tag.startsWith('webkit')) throw err;
      notes.push(`firstload ${tag}: initial read crashed (software GL); zoom and lod not checked`);
      return;
    }
    if (m.tile.x !== 31 || m.tile.y !== 37) {
      errors.push(`firstload-${tag}: spawn tile ${m.tile.x},${m.tile.y} (want 31,37)`);
    }
    if (!(m.zoom >= minZoom && m.zoom <= 1.0)) errors.push(`firstload-${tag}: zoom ${m.zoom} outside ${minZoom}..1`);
    const mapLeft = m.w >= 768 ? 496 : 0;
    const mapW = Math.max(1, m.w - mapLeft);
    const mapCx = mapLeft + mapW / 2;
    const dx = Math.abs(m.foot.x - mapCx) / mapW;
    const dy = Math.abs(m.foot.y - m.h / 2) / m.h;
    if (centred && (dx > 0.18 || dy > 0.22)) {
      errors.push(`firstload-${tag}: character at ${Math.round(m.foot.x)},${Math.round(m.foot.y)} is not near the map centre (${Math.round(mapCx)} of ${m.w}x${m.h})`);
    }
    if (m.foot.x < mapLeft + 8 || m.foot.x > m.w - 8 || m.foot.y < 60 || m.foot.y > m.h - 60) {
      errors.push(`firstload-${tag}: character off the map at ${Math.round(m.foot.x)},${Math.round(m.foot.y)}`);
    }
    for (const key of ['estudio', 'volaris']) {
      const pt = m[key];
      if (!pt || pt.x < mapLeft + 8 || pt.x > m.w - 8 || pt.y < 40 || pt.y > m.h - 40) {
        errors.push(`firstload-${tag}: ${key} door not in view ${JSON.stringify(pt)}`);
      }
    }
    if (m.lod !== 'cerca') errors.push(`firstload-${tag}: loads with ${m.lod} sprites at zoom ${m.zoom.toFixed(3)} (want cerca)`);
    if (!(m.lodBelow <= 0.25 + 1e-9 && m.lodBelow <= m.zoomMin * 2 + 1e-9)) {
      errors.push(`firstload-${tag}: lejos threshold ${m.lodBelow} is not within the last ×2 of zoom-out (min ${m.zoomMin})`);
    }
    const lodAt = async (z) => {
      // setZoom updates data-lod. A full texture upload here crashes software GL
      // once the whole town is on screen (phone @2x / headless WebKit); it is not part of the assertion.
      try {
        await page.evaluate((zz) => {
          window.__playtestQa.setZoom(zz);
        }, z);
        await wait(400);
        return await page.evaluate(() => document.getElementById('game-canvas')?.dataset.lod);
      } catch (err) {
        if (!isBrowserCrash(err)) throw err;
        return 'crashed';
      }
    };
    const mid = Math.sqrt(m.zoom * m.zoomMin);
    let sweepCrashed = false;
    for (const [z, want] of [[mid, 'cerca'], [m.lodBelow * 1.04, 'cerca'], [m.lodBelow * 0.96, 'lejos'], [m.zoomMin, 'lejos']]) {
      if (sweepCrashed) break;
      const got = await lodAt(z);
      if (got === 'crashed') {
        sweepCrashed = true;
        notes.push(`firstload ${tag}: zoom sweep stopped at ${Number(z).toFixed(3)} (software GL crashed; initial lod already checked)`);
        break;
      }
      if (got !== want) errors.push(`firstload-${tag}: zoom ${z.toFixed(3)} shows ${got} (want ${want}; lejos below ${m.lodBelow.toFixed(3)})`);
    }
    notes.push(`firstload ${tag}: zoom ${m.zoom.toFixed(3)} (${m.lod}, lejos below ${m.lodBelow.toFixed(3)}, min ${m.zoomMin.toFixed(3)}), character tile ${m.tile.x},${m.tile.y} at ${Math.round(m.foot.x)},${Math.round(m.foot.y)}`);
  } finally {
    await ctx.close();
  }
  });
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

/** A headless WebKit crash is a note. Chromium crashes still retry the group. */
async function runBrowser(group, kind, fn) {
  try {
    await fn();
  } catch (err) {
    if (!isBrowserCrash(err) || !String(kind).startsWith('webkit')) throw err;
    notes.push(`qa-smoke: ${group} ${kind} renderer crash; that browser stopped there`);
  }
}

async function exits(kind, only) {
  const before = errors.length;
  await runRun38InputSuite({ kind, base: BASE, errors, only });
  notes.push(`${kind}: ${only.join(' + ')} ${errors.length === before ? 'ok' : `${errors.length - before} failure(s)`}`);
}

const GROUPS = {
  firstload: async () => {
    await firstPaintBudget({ tag: 'chromium-1280', type: chromium, options: { viewport: { width: 1280, height: 800 } } });
    for (const spec of FIRST_LOAD) await firstLoad(spec);
  },
  chrome: async () => {
    for (const kind of ['chromium-1280', 'chromium-375']) {
      await runRun56LayoutSuite({ kind, base: BASE, errors, notes });
    }
  },
  'exits-desktop': () => exits('chromium-desktop', ['exit', 'door']),
  'exits-desktop-a': () => exits('chromium-desktop', ['exit', 'door']),
  'exits-desktop-b': () => exits('chromium-desktop', ['exit', 'door']),
  'exits-iphone': () =>
    QA_CHROMIUM_ONLY
      ? exits('chromium-phone', ['exit', 'door'])
      : runBrowser('exits-iphone', 'webkit-iphone', () => exits('webkit-iphone', ['exit', 'door'])),
  'exits-phone': () => exits('chromium-phone', ['exit']),
  input: async () => {
    for (const [kind, only] of chromiumOnlyKinds([
      ['chromium-1280', ['keys', 'wheel', 'minzoom', 'interior']],
      ['webkit-1280', ['keys', 'wheel', 'minzoom']],
      ['chromium-375', ['minzoom', 'interior']],
    ])) {
      await runBrowser('input', kind, () => runRun41InputSuite({ kind, base: BASE, errors, notes, only }));
    }
  },
  follow: async () => {
    for (const [kind, only] of chromiumOnlyKinds([
      ['chromium-1280', ['walk', 'pan', 'zoom']],
      ['chromium-375', ['walk', 'pan', 'zoom']],
      ['webkit-1280', ['walk']],
    ])) {
      try {
        await runRun42FollowSuite({ kind, base: BASE, errors, notes, only });
      } catch (err) {
        if (!isBrowserCrash(err) || !kind.startsWith('webkit')) throw err;
        notes.push(`qa-smoke: follow ${kind} renderer crash; that browser stopped there`);
      }
    }
  },
  logos: async () => {
    for (const kind of chromiumOnlyKinds(['chromium-1280', 'webkit-1280', 'chromium-375', 'webkit-iphone'])) {
      await runBrowser('logos', kind, () => runRun43LogoSuite({ kind, base: BASE, errors, notes }));
    }
  },
  npcs: async () => {
    for (const kind of chromiumOnlyKinds(['chromium-1280', 'webkit-1280', 'chromium-375'])) {
      await runRun44NpcSuite({ kind, base: BASE, errors, notes });
    }
  },
  player: async () => {
    for (const kind of chromiumOnlyKinds(['chromium-1280', 'webkit-1280', 'chromium-375'])) {
      await runBrowser('player', kind, () => runRun45PlayerSuite({ kind, base: BASE, errors, notes }));
    }
  },
  'player-1280': () => runRun45PlayerSuite({ kind: 'chromium-1280', base: BASE, errors, notes }),
  'player-375': () => runRun45PlayerSuite({ kind: 'chromium-375', base: BASE, errors, notes }),
  case: async () => {
    for (const kind of chromiumOnlyKinds(['chromium-1280', 'webkit-1280', 'chromium-375', 'webkit-iphone'])) {
      await runBrowser('case', kind, () => runRun46CaseSuite({ kind, base: BASE, errors, notes }));
    }
    for (const kind of chromiumOnlyKinds(['chromium-1280', 'webkit-iphone'])) {
      await runBrowser('case', kind, () => runRun55CaseSuite({ kind, base: BASE, errors, notes }));
    }
  },
  'case-1280': () => runRun46CaseSuite({ kind: 'chromium-1280', base: BASE, errors, notes }),
  'case-375': () => runRun46CaseSuite({ kind: 'chromium-375', base: BASE, errors, notes }),
  'case-55': async () => {
    await runRun55CaseSuite({ kind: 'chromium-1280', base: BASE, errors, notes });
    const phoneKind = QA_CHROMIUM_ONLY ? 'chromium-375' : 'webkit-iphone';
    if (RUN55_KINDS[phoneKind]) {
      await runRun55CaseSuite({ kind: phoneKind, base: BASE, errors, notes });
    }
  },
  fill: async () => {
    for (const kind of chromiumOnlyKinds(['chromium-1280', 'webkit-1280', 'chromium-375'])) {
      await runBrowser('fill', kind, () => runRun46FillSuite({ kind, base: BASE, errors, notes }));
    }
  },
  about: async () => {
    for (const kind of chromiumOnlyKinds(['chromium-1280', 'webkit-1280', 'chromium-390', 'webkit-iphone'])) {
      await runBrowser('about', kind, () => runRun47AboutSuite({ kind, base: BASE, errors, notes }));
    }
  },
  routines: () => runRun48RoutineSuite({ errors, notes }),
  bench: async () => {
    for (const kind of chromiumOnlyKinds(Object.keys(RUN50_KINDS))) {
      await runBrowser('bench', kind, () => runRun50BenchSuite({ kind, base: BASE, errors, notes }));
    }
  },
  'bench-1280': () => runRun50BenchSuite({ kind: 'chromium-1280', base: BASE, errors, notes }),
  'bench-375': () => runRun50BenchSuite({ kind: 'chromium-375', base: BASE, errors, notes }),
};
/** QA_SMOKE_ONLY=firstload,exits runs a subset of GROUPS (CI runs them as parallel shards); unset runs all. */
const ONLY = process.env.QA_SMOKE_ONLY?.split(',').filter(Boolean) ?? Object.keys(GROUPS);
const unknown = ONLY.filter((g) => !GROUPS[g]);
if (unknown.length) {
  preview?.kill('SIGKILL');
  console.error(`QA_SMOKE_ONLY: unknown group(s) ${unknown.join(', ')}; known: ${Object.keys(GROUPS).join(', ')}`);
  process.exit(1);
}

const t0 = Date.now();
try {
  for (const name of ONLY) {
    const t = Date.now();
    const before = errors.length;
    for (let attempt = 0; attempt < 3; attempt++) {
      const mark = errors.length;
      try {
        await GROUPS[name]();
        break;
      } catch (err) {
        if (!isBrowserCrash(err)) throw err;
        if (attempt < 2) {
          errors.splice(mark);
          notes.push(`qa-smoke: ${name} renderer crash, retry ${attempt + 2}/3`);
          continue;
        }
        notes.push(`qa-smoke: ${name} renderer crash after 3 tries; that group stopped there`);
        break;
      }
    }
    const failed = errors.length - before;
    for (const e of errors.slice(before)) console.error(`FAIL ${e}`);
    console.log(`qa-smoke: ${name} ${((Date.now() - t) / 1000).toFixed(0)} s${failed ? `, ${failed} failure(s)` : ''}`);
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
