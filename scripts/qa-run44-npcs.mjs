/**
 * Run #44 street NPCs (deploy gate). Loads the map with `?npcs=1` and samples every NPC on each
 * animation frame for a few seconds, then checks:
 *  - all 20 NPCs spawn, each on its own street tile, and only ever step onto street tiles
 *  - walking uses the facing's strip (walk_se / sw / ne / nw) and covers all four directions;
 *    some NPCs pause on the idle strip and set off again
 *  - characters draw at 2 world px per sheet px (64×100 world px cells) with nearest filtering
 *  - feet do not skate: each walk frame moves exactly one stride (4 or 8 world px in x, half in y)
 *    along the facing, on integer pixels, at ~10 fps
 *  - start frames differ, so the crowd does not walk in step
 *  - a tap on an NPC goes through to the map (the player walks); NPCs hide in interiors and under
 *    QA sprite isolation; automated browsers get no NPCs unless `?npcs=1`; reduced motion stands
 *    them still
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run44-npcs.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { installReadyWait } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);
const NPC_COUNT = 20;
const STEP = { se: [1, 0], sw: [0, 1], nw: [-1, 0], ne: [0, -1] };

export const RUN44_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.25 },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.25, light: true },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    zoom: 1,
    touch: true,
  },
};

function withQuery(base, q) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}

async function openMap(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__playtestQa?.npcs?.().loaded, null, { timeout: 30000 });
  await wait(300);
}

/** One compact row per NPC per rendered frame: [t, tx, ty, x, y, dir, mode, frame, stride, texture]. */
function sample(page, ms) {
  return qa(
    page,
    (dur) =>
      new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          const t = performance.now() - t0;
          out.push({
            t,
            n: window.__playtestQa
              .npcs()
              .npcs.map((n) => [n.id, n.tx, n.ty, n.x, n.y, n.dir, n.mode, n.frame, n.stride, n.texture]),
          });
          if (t < dur) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

function analyse(frames, streets, tag, errors) {
  const isStreet = (x, y) => streets.has(`${x},${y}`);
  const bad = new Map();
  const flag = (k, msg) => {
    if (!bad.has(k)) bad.set(k, msg);
  };
  const dirsWalked = new Set();
  let idleSamples = 0;
  let transitions = 0;
  let walkFrames = 0;
  let walkTime = 0;
  let pairs = 0;
  const prev = new Map();
  for (const { t, n } of frames) {
    const here = new Map();
    const targets = new Map();
    for (const [id, tx, ty, x, y, dir, mode, frame, stride, texture] of n) {
      if (!isStreet(tx, ty)) flag(`off-${id}`, `${id} stands on ${tx},${ty}, not a street tile`);
      if (texture !== `${mode}_${dir}`) flag(`tex-${id}`, `${id} ${mode} facing ${dir} shows ${texture}`);
      if (!Number.isInteger(x) || !Number.isInteger(y)) flag(`int-${id}`, `${id} at fractional pixel ${x},${y}`);
      const [dx, dy] = STEP[dir];
      const ox = x - (tx - ty) * 64;
      const oy = y - (tx + ty) * 32;
      const k = (dx - dy) !== 0 ? ox / ((dx - dy) * stride) : 0;
      const along = mode === 'walk' ? Number.isInteger(k) && k >= 0 && k < 64 / stride && oy * 2 === (dx + dy) * k * stride : ox === 0 && oy === 0;
      if (!along) flag(`along-${id}`, `${id} ${mode} ${dir} is ${ox},${oy} px off its tile centre, not on a stride of ${stride}`);
      if (here.has(`${tx},${ty}`)) flag(`share-${tx},${ty}`, `${id} and ${here.get(`${tx},${ty}`)} share tile ${tx},${ty}`);
      here.set(`${tx},${ty}`, id);
      if (mode === 'walk') {
        dirsWalked.add(dir);
        const nx = tx + dx;
        const ny = ty + dy;
        if (!isStreet(nx, ny)) flag(`step-${id}`, `${id} walks ${dir} from ${tx},${ty} onto ${nx},${ny}, not a street tile`);
        if (targets.has(`${nx},${ny}`)) flag(`tgt-${nx},${ny}`, `${id} and ${targets.get(`${nx},${ny}`)} both head for ${nx},${ny}`);
        targets.set(`${nx},${ny}`, id);
      } else idleSamples++;
      const p = prev.get(id);
      if (p) {
        if (p.mode !== mode) transitions++;
        if (p.mode === 'walk' && mode === 'walk' && p.tx === tx && p.ty === ty && p.dir === dir && t - p.t < 600) {
          const dk = k - p.k;
          const df = (frame - p.frame + 8) % 8;
          if (dk !== df) flag(`skate-${id}`, `${id} moved ${dk} stride(s) over ${df} walk frame(s) (feet skate)`);
          walkFrames += df;
          walkTime += t - p.t;
          pairs++;
        }
      }
      prev.set(id, { t, tx, ty, dir, mode, frame, k });
    }
    for (const [key, id] of targets) {
      if (here.has(key) && here.get(key) !== id) flag(`into-${key}`, `${id} heads for ${key} where ${here.get(key)} stands`);
    }
  }
  for (const msg of bad.values()) errors.push(`${tag}: ${msg}`);
  const missing = Object.keys(STEP).filter((d) => !dirsWalked.has(d));
  if (missing.length) errors.push(`${tag}: no NPC walked ${missing.join(', ')}`);
  if (!idleSamples) errors.push(`${tag}: no NPC paused on the idle strip`);
  if (!transitions) errors.push(`${tag}: no NPC switched between walking and idling`);
  const fps = walkTime ? (walkFrames / walkTime) * 1000 : 0;
  if (pairs && (fps < 7 || fps > 12.5)) errors.push(`${tag}: walk cycle runs at ${fps.toFixed(1)} fps (want ~10)`);
  return { dirsWalked: [...dirsWalked].sort(), idleSamples, transitions, fps, samples: frames.length };
}

/** Densest 5×5-tile patch of NPCs, for framing screenshots. */
function busiest(npcs) {
  let best = npcs[0];
  let bestN = -1;
  for (const a of npcs) {
    const n = npcs.filter((b) => Math.abs(b.tx - a.tx) <= 3 && Math.abs(b.ty - a.ty) <= 3).length;
    if (n > bestN) {
      bestN = n;
      best = a;
    }
  }
  return best;
}

async function tapThroughNpc(page, spec, tag, errors) {
  const snap = await qa(page, () => window.__playtestQa.npcs().npcs);
  for (const n of snap.filter((s) => s.mode === 'walk').concat(snap.filter((s) => s.mode !== 'walk'))) {
    await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y - 20, z), [n.x, n.y, spec.zoom]);
    await wait(80);
    const live = (await qa(page, () => window.__playtestQa.npcs().npcs)).find((s) => s.id === n.id);
    const pt = await qa(page, ([x, y]) => window.__playtestQa.worldToClient(x, y - 45), [live.x, live.y]);
    const onCanvas = await qa(page, ([x, y]) => document.elementFromPoint(x, y)?.id === 'game-canvas', [pt.x, pt.y]);
    if (!onCanvas) continue;
    await qa(page, () => {
      const c = document.getElementById('game-canvas');
      if (c) c.dataset.walkGoal = '';
    });
    if (spec.touch) await page.touchscreen.tap(pt.x, pt.y);
    else await page.mouse.click(pt.x, pt.y);
    let goal = null;
    for (let i = 0; i < 20 && !goal; i++) {
      await wait(100);
      goal = await qa(page, () => window.__playtestQa.readWalkGoal());
    }
    if (!goal) errors.push(`${tag}: tapping ${n.id}'s body did not reach the map (no walk started)`);
    return `tap on ${n.id} walked the player to ${goal ? `${goal.x},${goal.y}` : 'nowhere'}`;
  }
  errors.push(`${tag}: no NPC reachable on screen for the tap-through check`);
  return 'tap-through skipped';
}

/**
 * @param {{ kind: keyof typeof RUN44_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun44NpcSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN44_KINDS[kind];
  const tag = `run44-${kind}-npcs`;
  const browser = installReadyWait(await spec.type.launch());
  try {
    const ctx = await browser.newContext(spec.options);
    const page = await ctx.newPage();
    await openMap(page, withQuery(base, { npcs: '1' }));
    const streets = new Set((await qa(page, () => window.__playtestQa.streetTiles())).map((s) => `${s.x},${s.y}`));
    const first = await qa(page, () => window.__playtestQa.npcs());
    if (!first.enabled) errors.push(`${tag}: ?npcs=1 did not enable the crowd`);
    if (first.npcs.length !== NPC_COUNT) errors.push(`${tag}: ${first.npcs.length}/${NPC_COUNT} NPCs spawned`);
    const badSize = first.npcs.filter((n) => n.worldW !== 64 || n.worldH !== 100 || n.filter !== 'nearest/nearest');
    if (badSize.length) {
      const b = badSize[0];
      errors.push(`${tag}: ${badSize.length} NPC(s) not drawn at 64x100 world px with nearest filtering (${b.id}: ${b.worldW}x${b.worldH} ${b.filter})`);
    }
    const walkers = first.npcs.filter((n) => n.mode === 'walk');
    const startFrames = new Set(walkers.map((n) => n.frame));
    if (walkers.length >= 8 && startFrames.size < 4) {
      errors.push(`${tag}: walkers start on only ${startFrames.size} distinct frame(s) (crowd in step)`);
    }
    const centre = busiest(first.npcs);
    await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y, z), [centre.x, centre.y, spec.zoom]);
    const frames = await sample(page, spec.light ? 6000 : 9000);
    const a = analyse(frames, streets, tag, errors);
    const visible = (await qa(page, () => window.__playtestQa.npcs().npcs)).filter((n) => n.visible).length;
    if (!visible) errors.push(`${tag}: no NPC visible around ${centre.tx},${centre.ty}`);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `npcs-${kind}.png`) });
    }
    let extra = '';
    if (!spec.light) {
      const tap = await tapThroughNpc(page, spec, tag, errors);
      await qa(page, () => window.__playtestQa.isolateSprites(['tile:0,0']));
      await wait(100);
      const isoVisible = (await qa(page, () => window.__playtestQa.npcs().npcs)).filter((n) => n.visible).length;
      if (isoVisible) errors.push(`${tag}: ${isoVisible} NPC(s) visible under QA sprite isolation`);
      await qa(page, () => window.__playtestQa.isolateSprites(null));
      await qa(page, () => window.__playtestQa.enterInterior('estudio'));
      await page.waitForFunction(() => window.__playtestQa.isInInterior(), null, { timeout: 15000 });
      await wait(400);
      const inside = await qa(page, () => window.__playtestQa.npcs().npcs.filter((n) => n.visible).length);
      if (inside) errors.push(`${tag}: ${inside} NPC(s) visible inside the Estudio`);
      extra = `; ${tap}; hidden in interiors and under isolation`;
    }
    await ctx.close();

    const plainCtx = await browser.newContext(spec.options);
    const plain = await plainCtx.newPage();
    await openMap(plain, base);
    const off = await qa(plain, () => window.__playtestQa.npcs());
    if (off.enabled || off.npcs.some((n) => n.visible)) errors.push(`${tag}: automated browser without ?npcs=1 shows NPCs`);
    await plainCtx.close();

    if (!spec.light) {
      const rmCtx = await browser.newContext({ ...spec.options, reducedMotion: 'reduce' });
      const rm = await rmCtx.newPage();
      await openMap(rm, withQuery(base, { npcs: '1' }));
      const before = await qa(rm, () => window.__playtestQa.npcs().npcs.map((n) => `${n.x},${n.y},${n.frame}`).join('|'));
      await wait(1500);
      const after = await qa(rm, () => window.__playtestQa.npcs().npcs.map((n) => `${n.x},${n.y},${n.frame}`).join('|'));
      if (before !== after) errors.push(`${tag}: NPCs keep moving under prefers-reduced-motion`);
      await rmCtx.close();
      extra += '; still under reduced motion';
    }

    notes.push(
      `${tag}: ${first.npcs.length} NPCs at ${first.npcs[0]?.worldW}x${first.npcs[0]?.worldH} world px (${first.npcs[0]?.filter}), ${startFrames.size} distinct start frames among ${walkers.length} walkers; ` +
        `walked ${a.dirsWalked.join('/')}, ${a.transitions} walk/idle switches over ${a.samples} frames at ${a.fps.toFixed(1)} fps, ` +
        `${visible} on screen${extra}; off without ?npcs=1`,
    );
  } catch (e) {
    errors.push(`${tag}: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run44') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4210/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN44_KINDS)) await runRun44NpcSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.log(`FAIL: ${e}`);
  process.exit(errors.length ? 1 : 0);
}
