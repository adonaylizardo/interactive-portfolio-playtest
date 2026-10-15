/**
 * Run #39 sprite verification (Forge pack r39d).
 *
 *  - static: tokens (no world/bloom), PNG sizes vs sprites.json, manifest door checks, case masks
 *  - pixel-diff: every sprite on the map (buildings x 3 states, props, tiles) at cerca + lejos, drawn
 *    alone on the canvas and compared with the probe colours measured from the PNG
 *  - map data: street variants vs neighbours, door faces vs manifest `puerta.verificacion`,
 *    obelisco collision strip from the manifest `colision`
 *  - case interiors: walk grid == `mascara_caminable`, exit mat walkable, cerca probes down to room min zoom
 *  - `--shots`: writes artifacts/run39 screenshots (case interiors desktop + 375, exteriors)
 *
 * Usage: npm run qa:sprites [-- --shots]   (builds first; QA_BASE_URL skips the local preview server)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchBrowser } from './qa-ready.mjs';
import { armExitTimer, readExitTimer, exitIsImmediate, describeExit } from './qa-exit-timer.mjs';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4192;
const BASE =
  process.env.QA_BASE_URL ?? `http://127.0.0.1:${PREVIEW_PORT}/interactive-portfolio-playtest/`;
const SHOTS = process.argv.includes('--shots');
/** QA_SPRITES_ONLY=map,picks runs a subset (placement, picks, map, diff, interiors, shots with --shots); unset runs all. */
const ONLY = process.env.QA_SPRITES_ONLY?.split(',');
const want = (part) => !ONLY || ONLY.includes(part);
const OUT = path.join(ROOT, 'artifacts', 'run39');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'];
/** Landmark cutaway rooms: hand-authored masks in src/data/interior-rooms.json. */
const ART_ROOMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/interior-rooms.json'), 'utf8'));
const sprites = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/sprites.json'), 'utf8'));
const probes = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/sprites/probes.json'), 'utf8'));
/** Map-fill frames (src/data/relleno.json) share the registry and the public/sprites root. */
const relleno = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/relleno.json'), 'utf8'));
const A = { ...sprites.assets, ...relleno.assets };

/** Thin props have no 7x7 uniform patch in the pack, so derive opaque 3x3 patches from the PNG itself. */
function derivedProbes(key) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'public/sprites', A[key].f1)));
  const at = (x, y) => {
    const i = (png.width * y + x) << 2;
    return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
  };
  const out = [];
  for (let y = 1; y < png.height - 1; y += 3) {
    for (let x = 1; x < png.width - 1; x += 3) {
      const c = at(x, y);
      if (c[3] !== 255) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = at(x + dx, y + dy);
          if (n[3] !== 255 || Math.abs(n[0] - c[0]) + Math.abs(n[1] - c[1]) + Math.abs(n[2] - c[2]) > 8) {
            ok = false;
            break;
          }
        }
      }
      if (ok) out.push([x, y, c[0], c[1], c[2]]);
    }
  }
  if (!out.length) {
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const c = at(x, y);
        if (c[3] === 255) out.push([x, y, c[0], c[1], c[2]]);
      }
    }
  }
  if (out.length > 16) {
    const step = out.length / 16;
    return Array.from({ length: 16 }, (_, i) => out[Math.floor(i * step)]);
  }
  return out;
}
const probeList = (key) => (probes[key]?.length ? probes[key] : derivedProbes(key));
const errors = [];
const notes = [];
const fail = (m) => errors.push(m);

function walkFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function staticChecks() {
  const hits = [];
  for (const f of walkFiles(path.join(ROOT, 'src'))) {
    if (/world\/bloom|\bbloom\b/i.test(fs.readFileSync(f, 'utf8'))) hits.push(path.relative(ROOT, f));
  }
  if (hits.length) fail(`static: retired token world/bloom still referenced in ${hits.join(', ')}`);
  if (!/#171C18/i.test(fs.readFileSync(path.join(ROOT, 'src/tokens.ts'), 'utf8'))) {
    fail('static: tokens.ts is missing world/grass #171C18');
  }

  for (const [key, a] of Object.entries(A)) {
    for (const [file, scale] of [[a.f1, 1], [a.f2, 2]]) {
      const p = path.join(ROOT, 'public/sprites', file);
      if (!fs.existsSync(p)) {
        fail(`static: ${key} missing file ${file}`);
        continue;
      }
      const png = PNG.sync.read(fs.readFileSync(p));
      if (png.width !== a.w * scale || png.height !== a.h * scale) {
        fail(`static: ${key} ${file} is ${png.width}x${png.height}, expected ${a.w * scale}x${a.h * scale}`);
      }
    }
    if (!probeList(key).length) fail(`static: ${key} has no probes and no opaque patch to derive`);
  }

  for (const c of CASES) {
    const m = sprites.meta[`ext/${c}`]?.puerta?.verificacion;
    if (!m?.coincide) fail(`static: ext/${c} manifest puerta.verificacion.coincide is not true`);
    const mask = sprites.meta[`int/${c}`]?.mascara_caminable?.filas_y0_a_y5;
    if (!mask || mask.length !== 6 || mask.some((r) => r.length !== 6)) {
      fail(`static: int/${c} has no 6x6 mascara_caminable`);
      continue;
    }
    const cells = maskCells(mask);
    const exit = cells.exit;
    if (!exit) fail(`static: int/${c} mask has no exit cell`);
    else if (cells.free.size && !allConnected(cells.free, exit)) {
      fail(`static: int/${c} mask has free cells not connected to the exit`);
    }
  }
  const ob = sprites.meta['prop/obelisco'];
  const solid = ob?.colision?.solida?.celdas ?? [];
  const walk = ob?.colision?.caminable?.celdas ?? [];
  const front = ob?.frente?.mira_a;
  if (!solid.length || !front) fail('static: obelisco manifest lacks colision.solida or frente.mira_a');
  const EXPECT_SOLID = [[14, 36], [15, 35], [15, 36], [15, 37], [16, 36]];
  const EXPECT_WALK = [[14, 35], [14, 37], [16, 35], [16, 37]];
  const norm = (l) => JSON.stringify([...l].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  if (norm(solid) !== norm(EXPECT_SOLID)) fail(`static: obelisco manifest solid cells ${norm(solid)} != ${norm(EXPECT_SOLID)}`);
  if (norm(walk) !== norm(EXPECT_WALK)) fail(`static: obelisco manifest walkable cells ${norm(walk)} != ${norm(EXPECT_WALK)}`);
  if (JSON.stringify(front) !== '[17,36]') fail(`static: obelisco stair foot ${JSON.stringify(front)} != [17,36]`);
  const footprint = (x, y) => x >= 14 && x <= 16 && y >= 35 && y <= 37;
  if (![...solid, ...walk].every(([x, y]) => footprint(x, y)) || solid.length + walk.length !== 9) {
    fail('static: obelisco manifest solida + caminable do not tile the 3x3 footprint');
  }
  if (solid.some(([x, y]) => x === front[0] && y === front[1])) fail('static: obelisco access cell is solid');
  const foot = ob?.arco?.apoya?.celda;
  if (foot && !solid.some(([x, y]) => x === foot[0] && y === foot[1])) fail(`static: obelisco arch foot ${foot} is not a solid cell`);
  const mapa = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mapa_datos.json'), 'utf8'));
  const row = (mapa.hitos ?? mapa.landmarks ?? []).find?.((h) => h.id === 'obelisco');
  const listed = JSON.stringify(row?.acceso ?? front);
  if (listed !== JSON.stringify(front)) fail(`static: mapa_datos obelisco access ${listed} != manifest frente ${JSON.stringify(front)}`);
}

function maskCells(rows) {
  const free = new Set();
  let exit = null;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '#') free.add(`${x},${y}`);
      if (ch === 'S') exit = { x, y };
    });
  });
  return { free, exit };
}

function allConnected(free, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${c.x + dx},${c.y + dy}`;
      if (free.has(k) && !seen.has(k)) {
        seen.add(k);
        q.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  return seen.size === free.size;
}

const dist = (c, e) => (c ? Math.abs(c.r - e[2]) + Math.abs(c.g - e[3]) + Math.abs(c.b - e[4]) : 999);

async function openMap(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(700);
}

async function diffSprite(page, { key, tlx, tly, zoom, id, state }) {
  const a = A[key];
  const pr = probeList(key);
  if (!a || !pr.length) {
    fail(`pixel: ${key} not in sprites.json or no probes`);
    return;
  }
  await page.evaluate(
    async (o) => {
      const q = window.__playtestQa;
      if (o.id) {
        await q.forceBuildingState(o.state);
        q.isolateSprites([o.id]);
      } else {
        q.isolateSprites([]);
        q.previewSprite(o.key, 0, 0);
      }
      q.frameWorld(o.cx, o.cy, o.zoom);
    },
    { id, state, key, cx: tlx + a.w / 2, cy: tly + a.h / 2, zoom },
  );
  await wait(60);
  const pts = await page.evaluate(
    (list) => list.map(([wx, wy]) => window.__playtestQa.worldToClient(wx, wy)),
    pr.map((p) => [tlx + p[0], tly + p[1]]),
  );
  const cols = await page.evaluate((p) => window.__playtestQa.sampleCanvasColors(p), pts);
  const thin = !probes[key]?.length;
  if (thin) {
    const BG = [11, 12, 14];
    // Dark art (lejos tree canopies) can sit within a few levels of the background, so a
    // sample also counts when it matches the probe's own colour.
    const drawn = cols.filter(
      (c, i) => c && (Math.abs(c.r - BG[0]) + Math.abs(c.g - BG[1]) + Math.abs(c.b - BG[2]) > 12 || dist(c, pr[i]) <= 24),
    ).length;
    if (drawn < pr.length * 0.7) {
      const seen = pr.slice(0, 4).map((p, i) => `(${p[0]},${p[1]}) got ${cols[i] ? `${cols[i].r},${cols[i].g},${cols[i].b}` : 'offscreen'} want ${p[2]},${p[3]},${p[4]}`);
      fail(`pixel: ${key} thin sprite drawn at only ${drawn}/${pr.length} opaque points: ${seen.join(' | ')}`);
    }
    return;
  }
  const tol = zoom >= 1 ? 30 : 60;
  const bad = [];
  pr.forEach((p, i) => {
    const d = dist(cols[i], p);
    if (d > tol) bad.push(`(${p[0]},${p[1]}) got ${cols[i] ? `${cols[i].r},${cols[i].g},${cols[i].b}` : 'offscreen'} want ${p[2]},${p[3]},${p[4]}`);
  });
  const allowed = zoom >= 1 ? Math.floor(pr.length * 0.15) : Math.floor(pr.length * 0.3);
  if (bad.length > allowed) fail(`pixel: ${key} ${bad.length}/${pr.length} probes off: ${bad.slice(0, 3).join(' | ')}`);
}

/** A zoom inside this viewport's lejos band (the scene switches below `data-lod-below`). */
async function lejosZoom(page) {
  const z = await page.evaluate(() => {
    const d = document.getElementById('game-canvas').dataset;
    return (Number(d.lodBelow) + Number(d.zoomMin)) / 2;
  });
  if (!(z > 0)) fail('lod: canvas has no data-lod-below / data-zoom-min');
  return z;
}

async function pixelDiffMap(page) {
  await page.evaluate(() => window.__playtestQa.loadAllSprites());
  const LEJOS_Z = await lejosZoom(page);
  const instances = await page.evaluate(() => window.__playtestQa.spriteInstances());
  const covered = new Set();
  const seenKey = new Set();
  const fullCoverage = new Set(Object.keys(A).filter((k) => !k.startsWith('int/')));

  for (const inst of instances) {
    const isTile = inst.kind === 'tile';
    const isBuilding = inst.key.startsWith('ext/');
    const baseKey = inst.key;
    if (seenKey.has(baseKey)) continue;
    seenKey.add(baseKey);
    const sx = inst.tl.x + A[baseKey].vfs.x;
    const sy = inst.tl.y + A[baseKey].vfs.y;
    const states = isBuilding ? ['default', 'hover', 'resaltado'] : ['default'];
    const lods = isTile ? ['cerca'] : ['cerca', 'lejos'];
    for (const state of states) {
      for (const lod of lods) {
        let key = baseKey;
        if (isBuilding) key = key.replace('/default/', `/${state}/`);
        if (!isTile) key = key.replace(/\/(cerca|lejos)$/, `/${lod}`);
        covered.add(key);
        await diffSprite(page, {
          key,
          tlx: sx - A[key].vfs.x,
          tly: sy - A[key].vfs.y,
          zoom: lod === 'cerca' || !probes[key]?.length ? 1 : LEJOS_Z,
          id: inst.id,
          state,
        });
      }
    }
  }
  await page.evaluate(async () => {
    window.__playtestQa.isolateSprites(null);
    await window.__playtestQa.forceBuildingState(null);
  });

  const unplaced = [...fullCoverage].filter((k) => !covered.has(k));
  for (const key of unplaced) {
    await diffSprite(page, {
      key,
      tlx: -A[key].vfs.x,
      tly: -A[key].vfs.y,
      zoom: key.endsWith('/lejos') && probes[key]?.length ? LEJOS_Z : 1,
    });
    covered.add(key);
  }
  await page.evaluate(() => {
    window.__playtestQa.previewSprite(null);
    window.__playtestQa.isolateSprites(null);
  });
  notes.push(
    `pixel-diff: ${covered.size}/${fullCoverage.size} exterior/prop/tile sprite keys compared (${unplaced.length} not on the map, shown through the preview hook)`,
  );
}

async function mapChecks(page) {
  const streets = await page.evaluate(() => window.__playtestQa.streetTiles());
  const set = new Set(streets.map((s) => `${s.x},${s.y}`));
  const sideOf = [['ne', 0, -1], ['se', 1, 0], ['sw', 0, 1], ['nw', -1, 0]];
  let off = 0;
  for (const s of streets) {
    const want = sideOf.filter(([, dx, dy]) => set.has(`${s.x + dx},${s.y + dy}`)).map(([n]) => n);
    const key = want.length ? `tile/calle/${want.join('-')}` : null;
    if (key && (s.key !== key || !A[key])) {
      off++;
      if (off < 6) fail(`street: (${s.x},${s.y}) uses ${s.key}, neighbours say ${key}`);
    }
  }
  notes.push(`street tiles: ${streets.length} checked against 4-neighbour connectivity, ${off} mismatches`);

  const houses = await page.evaluate(() => window.__playtestQa.getEnterableBuildings());
  for (const c of CASES) {
    const h = houses.find((b) => b.name === c);
    const v = sprites.meta[`ext/${c}`].puerta.verificacion;
    if (!h) {
      fail(`door: ${c} not found in map data`);
      continue;
    }
    if (h.doorFace !== v.cara_puerta_mapa) fail(`door: ${c} map doorFace ${h.doorFace} != manifest ${v.cara_puerta_mapa}`);
    if (h.door.x !== v.acceso_mapa[0] || h.door.y !== v.acceso_mapa[1]) {
      fail(`door: ${c} map access (${h.door.x},${h.door.y}) != manifest (${v.acceso_mapa})`);
    }
  }

  const ob = sprites.meta['prop/obelisco'];
  const solid = ob.colision.solida.celdas;
  const walkable = ob.colision.caminable.celdas;
  const front = ob.frente.mira_a;
  const start = [front[0] + 3, front[1]];
  const reach = (x, y) => page.evaluate(([a, b, c, d]) => window.__playtestQa.findPath(a, b, c, d), [start[0], start[1], x, y]);
  for (const [x, y] of solid) {
    if (await reach(x, y)) fail(`obelisco: manifest solid cell (${x},${y}) is reachable`);
  }
  for (const [x, y] of [...walkable, front]) {
    if (!(await reach(x, y))) fail(`obelisco: manifest walkable cell (${x},${y}) is not walkable`);
  }
  const solidKeys = new Set(solid.map(([x, y]) => `${x},${y}`));
  const around = await page.evaluate(([a, b]) => window.__playtestQa.findPath(a[0], a[1], b[0], b[1]), [[14, 35], front]);
  if (!around) fail('obelisco: no way from the back of the plaza to the stair foot');
  else if (around.some((c) => solidKeys.has(`${c.x},${c.y}`))) fail('obelisco: path crosses a solid cell');

  // Tapping the monument itself walks to the stair foot and never enters a solid cell.
  const sil = await page.evaluate(() => window.__playtestQa.obeliscoSilhouettes());
  const onSil = (x, y) =>
    sil.some((pts) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    });
  for (const [tx, ty] of solid.filter(([x, y]) => onSil((x - y) * 64, (x + y) * 32))) {
    await page.evaluate(([x, y]) => window.__playtestQa.setCharacterTile(x, y), [front[0] + 3, front[1]]);
    await wait(150);
    await page.evaluate(([x, y]) => {
      const q = window.__playtestQa;
      const cx = (x - y) * 64;
      const cy = (x + y) * 32;
      q.frameWorld(cx, cy - 40, 1);
      const pt = q.worldToClient(cx, cy);
      q.tapScreen(pt.x, pt.y);
    }, [tx, ty]);
    let last = null;
    let entered = false;
    for (let i = 0; i < 80; i++) {
      await wait(150);
      last = await page.evaluate(() => JSON.parse(document.getElementById('game-canvas').dataset.charTile ?? 'null'));
      if (last && solidKeys.has(`${last.x},${last.y}`)) entered = true;
      if (last && last.x === front[0] && last.y === front[1]) break;
    }
    if (entered) fail(`obelisco: walking after tapping (${tx},${ty}) entered a solid cell`);
    if (!last || last.x !== front[0] || last.y !== front[1]) fail(`obelisco: tap on (${tx},${ty}) ended at ${JSON.stringify(last)}, expected stair foot ${front}`);
  }
  notes.push(`doors: 5 case houses match manifest puerta.verificacion; obelisco: ${solid.length} manifest solid cells blocked, ${walkable.length} plaza cells + stair foot (${front}) walkable, tap on the monument ends at the stair foot`);
  await groundTapChecks(page, solidKeys, front);
  await muroChecks(page);
}

/**
 * Taps over tall sprites: walkable ground under the tap wins (behind the obelisco shaft, behind
 * trees and lamps); on a solid obelisco cell only the drawn monument goes to the stair foot and
 * bare plaza goes to an open neighbour. Each point is tapped through Pixi (mouse) and the touch path.
 */
async function groundTapChecks(page, solidKeys, front) {
  const sil = await page.evaluate(() => window.__playtestQa.obeliscoSilhouettes());
  const inPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const onMonument = (x, y) => sil.some((h) => inPoly(x, y, h));
  const centre = (x, y) => [(x - y) * 64, (x + y) * 32];
  const tapGoal = (wx, wy, via) =>
    page.evaluate(
      async ([x, y, mode]) => {
        const q = window.__playtestQa;
        const c = document.getElementById('game-canvas');
        q.setCharacterTile(24, 40);
        q.frameWorld(x, y, 1);
        await new Promise((r) => setTimeout(r, 30));
        c.dataset.walkGoal = '';
        const p = q.worldToClient(x, y);
        if (mode === 'touch') q.tapScreen(p.x, p.y);
        return mode === 'touch' ? JSON.parse(c.dataset.walkGoal || 'null') : p;
      },
      [wx, wy, via],
    );
  const goalAt = async (wx, wy) => {
    const out = {};
    out.touch = await tapGoal(wx, wy, 'touch');
    const p = await tapGoal(wx, wy, 'mouse');
    await page.mouse.click(p.x, p.y);
    await wait(60);
    out.mouse = await page.evaluate(() => JSON.parse(document.getElementById('game-canvas').dataset.walkGoal || 'null'));
    return out;
  };
  const same = (g, x, y) => g && g.x === x && g.y === y;
  let behind = 0;
  for (let y = 30; y <= 37; y++) {
    for (let x = 9; x <= 16; x++) {
      if (solidKeys.has(`${x},${y}`) || x + y >= 51) continue;
      const [cx, cy] = centre(x, y);
      if (!onMonument(cx, cy)) continue;
      const g = await goalAt(cx, cy);
      behind++;
      for (const via of ['touch', 'mouse']) {
        if (!same(g[via], x, y)) fail(`ground tap (${via}): centre of (${x},${y}) behind the obelisco shaft went to ${JSON.stringify(g[via])}`);
      }
    }
  }
  if (behind < 3) fail(`ground tap: only ${behind} tiles found behind the obelisco shaft`);

  let bare = 0;
  let monument = 0;
  for (const key of solidKeys) {
    const [x, y] = key.split(',').map(Number);
    const [cx, cy] = centre(x, y);
    let barePt = null;
    let monPt = null;
    for (let fy = -0.4; fy <= 0.4 && (!barePt || !monPt); fy += 0.1) {
      for (let fx = -0.4; fx <= 0.4; fx += 0.1) {
        const wx = cx + (fx - fy) * 64;
        const wy = cy + (fx + fy) * 32;
        if (!barePt && !onMonument(wx, wy)) barePt = [wx, wy];
        if (!monPt && onMonument(wx, wy)) monPt = [wx, wy];
      }
    }
    if (monPt) {
      const g = await goalAt(...monPt);
      monument++;
      for (const via of ['touch', 'mouse']) {
        if (!same(g[via], front[0], front[1])) fail(`ground tap (${via}): monument on (${x},${y}) went to ${JSON.stringify(g[via])}, want stair foot`);
      }
    }
    if (barePt) {
      const g = await goalAt(...barePt);
      bare++;
      for (const via of ['touch', 'mouse']) {
        const t = g[via];
        const near = t && Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) === 1 && !solidKeys.has(`${t.x},${t.y}`);
        if (!near) fail(`ground tap (${via}): bare plaza on solid (${x},${y}) went to ${JSON.stringify(t)}, want an open neighbour`);
      }
    }
  }

  const props = (await page.evaluate(() => window.__playtestQa.spriteInstances())).filter((i) => /^prop\/(tree|lamp)\//.test(i.id));
  let propTaps = 0;
  for (const inst of props.slice(0, 12)) {
    const [px, py] = inst.id.split('/')[2].split('-').map(Number);
    const tx = px - 1;
    const ty = py - 1;
    const free = await page.evaluate(([a, b, c, d]) => window.__playtestQa.findPath(a, b, c, d), [24, 40, tx, ty]);
    if (!free) continue;
    const [cx, cy] = centre(tx, ty);
    const claimed = await page.evaluate(async ([x, y]) => {
      const q = window.__playtestQa;
      q.setCharacterTile(24, 40);
      q.frameWorld(x, y, 1);
      await new Promise((r) => setTimeout(r, 30));
      const p = q.worldToClient(x, y);
      const k = q.pickAt(p.x, p.y);
      return k.building ?? k.door;
    }, [cx, cy]);
    if (claimed) continue;
    const g = await goalAt(cx, cy);
    propTaps++;
    for (const via of ['touch', 'mouse']) {
      if (!same(g[via], tx, ty)) fail(`ground tap (${via}): tile (${tx},${ty}) behind ${inst.id} went to ${JSON.stringify(g[via])}`);
    }
  }
  notes.push(`ground taps (mouse + touch): ${behind} tiles behind the obelisco shaft, ${monument} monument points -> stair foot, ${bare} bare-plaza points on solid cells -> open neighbour, ${propTaps} tiles behind trees/lamps`);
}

/**
 * Muro: sprite floor == the 3×2 footprint, and collision == the cells behind the walls the sprite
 * actually draws. A footprint edge carries a wall when the point 16 px above its midpoint is opaque
 * in the sprite's alpha mask and lies outside the floor diamond.
 */
async function muroChecks(page) {
  const masks = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/sprite-alpha.json'), 'utf8'));
  const e = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mapa_datos.json'), 'utf8')).edificios.muro;
  const inst = (await page.evaluate(() => window.__playtestQa.spriteInstances())).find((i) => i.id === 'paisaje/muro');
  const m = masks['prop/muro'];
  if (!inst || !m) {
    fail('muro: no sprite instance or alpha mask');
    return;
  }
  const bits = Buffer.from(m.bits, 'base64');
  const opaque = (wx, wy) => {
    const cx = Math.floor((wx - inst.tl.x) / m.cell);
    const cy = Math.floor((wy - inst.tl.y) / m.cell);
    if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
    const i = cy * m.w + cx;
    return ((bits[i >> 3] >> (i & 7)) & 1) === 1;
  };
  const centre = (x, y) => [(x - y) * 64, (x + y) * 32];
  const vfs = A[inst.key].vfs;
  const [fsx, fsy] = centre(e.x + e.w - 1, e.y + e.h - 1);
  if (inst.tl.x + vfs.x !== fsx || inst.tl.y + vfs.y !== fsy + 32) {
    fail(`muro: sprite floor front vertex (${inst.tl.x + vfs.x},${inst.tl.y + vfs.y}) is not the footprint front vertex (${fsx},${fsy + 32})`);
  }
  const inFoot = (x, y) => x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h;
  const wallBehind = new Set();
  for (let y = e.y; y < e.y + e.h; y++) {
    for (let x = e.x; x < e.x + e.w; x++) {
      const [cx, cy] = centre(x, y);
      if (!opaque(cx, cy)) fail(`muro: footprint cell (${x},${y}) centre is not on the sprite floor`);
      // Back edges only (−y, −x): raising their midpoint leaves the floor diamond.
      for (const [dx, dy, ex, ey] of [[0, -1, 32, -16], [-1, 0, -32, -16]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (inFoot(nx, ny)) continue;
        if (opaque(cx + ex, cy + ey - 16)) wallBehind.add(`${nx},${ny}`);
      }
    }
  }
  if (wallBehind.size) {
    const xs = [...wallBehind].map((k) => k.split(',').map(Number));
    const minX = Math.min(...xs.map(([x]) => x));
    const minY = Math.min(...xs.map(([, y]) => y));
    if (xs.some(([x]) => x === minX) && xs.some(([, y]) => y === minY)) wallBehind.add(`${minX},${minY}`);
  }
  const start = [e.acceso[0], e.acceso[1]];
  const reach = (x, y) => page.evaluate(([a, b, c, d]) => window.__playtestQa.findPath(a, b, c, d), [start[0], start[1], x, y]);
  const blocked = [];
  for (let y = e.y - 1; y <= e.y + e.h; y++) {
    for (let x = e.x - 1; x <= e.x + e.w; x++) {
      if (x === start[0] && y === start[1]) continue;
      const ok = await reach(x, y);
      if (!ok) blocked.push(`${x},${y}`);
      if (inFoot(x, y) && !ok) fail(`muro: footprint cell (${x},${y}) is blocked; the sprite draws open floor there`);
    }
  }
  const want = [...wallBehind].sort().join(' ');
  const got = blocked.filter((k) => !inFoot(...k.split(',').map(Number))).sort().join(' ');
  if (want !== got) fail(`muro: collision cells [${got}] != cells behind the sprite's walls [${want}]`);
  if (wallBehind.size !== 6) fail(`muro: expected the back wall (3) + left wall (2) + corner, found ${wallBehind.size} cells`);
  notes.push(`muro: checked sprite floor vs footprint (${e.x}-${e.x + e.w - 1}, ${e.y}-${e.y + e.h - 1}) and collision vs the ${wallBehind.size} cells behind the walls found in the sprite alpha`);
}

/**
 * Expected sprite top-left per item, worked out by hand from the manifests:
 * S = south vertex of the footprint's front cell (x+w−1, y+h−1) = ((x−y)·64, (x+y)·32 + 32),
 * top-left = S − ancla − (0, offset_y), or S − vertice_frontal_suelo for Sambil and Muro.
 */
const ITEM_TOP_LEFT = {
  'building/estudio': [-512, 1688],
  'building/volaris': [128, 2080],
  'building/bain': [768, 1760],
  'building/mentoria': [320, 1536],
  'building/finoa': [-320, 1216],
  'building/pg': [-768, 1440],
  'building/sambil': [1792, 1696],
  'building/catedral': [-320, 480],
  'building/flor': [-448, 2624],
  'paisaje/obelisco': [-1536, 1200],
  'paisaje/redoma': [448, 2496],
  'paisaje/muro': [-448, 2089],
};
const ITEMS = Object.keys(ITEM_TOP_LEFT);
const MAP_BOUNDS = { minX: -63 * 64 - 128, maxX: 63 * 64 + 128, minY: 0, maxY: 126 * 32 + 128 };

async function placementChecks(page) {
  const instances = await page.evaluate(() => window.__playtestQa.spriteInstances());
  const mapa = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mapa_datos.json'), 'utf8')).edificios;
  for (const id of ITEMS) {
    const inst = instances.find((i) => i.id === id);
    const [ex, ey] = ITEM_TOP_LEFT[id];
    if (!inst) {
      fail(`top-left: ${id} has no sprite on the map`);
      continue;
    }
    if (inst.tl.x !== ex || inst.tl.y !== ey) fail(`top-left: ${id} at (${inst.tl.x},${inst.tl.y}), expected (${ex},${ey})`);
    const e = mapa[id.split('/')[1]];
    const fx = e.x + e.w - 1;
    const fy = e.y + e.h - 1;
    const vfs = A[inst.key].vfs;
    const fx0 = (fx - fy) * 64 - vfs.x;
    const fy0 = (fx + fy) * 32 + 32 - vfs.y;
    if (fx0 !== ex || fy0 !== ey) fail(`top-left: ${id} formula from mapa_datos + sprites.json gives (${fx0},${fy0}), expected (${ex},${ey})`);
    const b = A[inst.key].bbox;
    const top = inst.tl.y + b.y0;
    if (inst.tl.x + b.x0 < MAP_BOUNDS.minX || inst.tl.x + b.x1 > MAP_BOUNDS.maxX || top < MAP_BOUNDS.minY || inst.tl.y + b.y1 > MAP_BOUNDS.maxY) {
      fail(`camera: ${id} opaque box leaves the camera fit bounds (top y ${top})`);
    }
  }
  for (const [key, a] of Object.entries(A)) {
    if (key.startsWith('tile/') && (a.vfs.x !== 64 || a.vfs.y !== 64)) {
      fail(`top-left: ${key} diamond is not at the top of its frame (vfs ${a.vfs.x},${a.vfs.y}, want 64,64)`);
    }
  }
  const cat = instances.find((i) => i.id === 'building/catedral');
  notes.push(
    `top-left: ${ITEMS.length} items match the manifest formula; all inside the camera fit bounds (Catedral top at y=${cat ? cat.tl.y + A[cat.key].bbox.y0 : '?'}, bounds minY=${MAP_BOUNDS.minY}); every tile diamond sits at its frame top`,
  );
}

/** Taps resolve by sprite alpha + footprint diamond + door rectangle (no face geometry). */
async function pickChecks(page) {
  const masks = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/sprite-alpha.json'), 'utf8'));
  const mapa = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mapa_datos.json'), 'utf8')).edificios;
  const instances = await page.evaluate(() => window.__playtestQa.spriteInstances());
  const pickAtWorld = async (wx, wy) =>
    page.evaluate(([x, y]) => {
      const q = window.__playtestQa;
      q.frameWorld(x, y + 60, 1);
      const p = q.worldToClient(x, y);
      return q.pickAt(p.x, p.y);
    }, [wx, wy]);
  const inFootprint = (name, wx, wy) => {
    const e = mapa[name];
    const foot = (x, y) => [(x - y) * 64, (x + y) * 32 + 32];
    const [swx, swy] = foot(e.x, e.y + e.h - 1);
    const [sx, sy] = foot(e.x + e.w - 1, e.y + e.h - 1);
    const [nex, ney] = foot(e.x + e.w - 1, e.y);
    const [nx, ny] = foot(e.x, e.y);
    const poly = [[swx - 64, swy - 32], [sx, sy], [nex + 64, ney - 32], [nx, ny - 64]];
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[j];
      if (ay > wy !== by > wy && wx < ((bx - ax) * (wy - ay)) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  };
  const opaqueAt = (base, inst, wx, wy) => {
    const m = masks[base];
    if (!m || !inst) return false;
    const cx = Math.floor((wx - inst.tl.x) / m.cell);
    const cy = Math.floor((wy - inst.tl.y) / m.cell);
    if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
    const i = cy * m.w + cx;
    return ((Buffer.from(m.bits, 'base64')[i >> 3] >> (i & 7)) & 1) === 1;
  };
  const buildings = ITEMS.filter((i) => i.startsWith('building/')).map((i) => i.split('/')[1]);
  let checked = 0;
  for (const name of buildings) {
    const inst = instances.find((i) => i.id === `building/${name}`);
    const m = masks[`ext/${name}`];
    if (!inst || !m) {
      fail(`pick: ${name} has no sprite or tap mask`);
      continue;
    }
    const bits = Buffer.from(m.bits, 'base64');
    const on = (cx, cy) => cx >= 0 && cy >= 0 && cx < m.w && cy < m.h && ((bits[(cy * m.w + cx) >> 3] >> ((cy * m.w + cx) & 7)) & 1) === 1;
    let top = null;
    for (let cy = 0; cy < m.h && !top; cy++) {
      for (let cx = 0; cx < m.w; cx++) {
        if (on(cx, cy) && on(cx + 1, cy) && on(cx, cy + 1) && on(cx + 1, cy + 1)) {
          top = [cx, cy];
          break;
        }
      }
    }
    const wx = inst.tl.x + top[0] * m.cell + m.cell;
    const wy = inst.tl.y + top[1] * m.cell + m.cell;
    const topPick = await pickAtWorld(wx, wy);
    if (topPick.building !== name) fail(`pick: tap on the top of ${name} (${wx},${wy}) picked ${topPick.building}`);

    let clear = null;
    for (let cy = 2; cy < m.h * 0.5 && !clear; cy += 2) {
      for (let cx = 2; cx < m.w - 2; cx += 2) {
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (on(cx + dx, cy + dy)) near = true;
        if (near) continue;
        const px = inst.tl.x + cx * m.cell + 2;
        const py = inst.tl.y + cy * m.cell + 2;
        if (inFootprint(name, px, py)) continue;
        const others = buildings.some(
          (o) => o !== name && (opaqueAt(`ext/${o}`, instances.find((i) => i.id === `building/${o}`), px, py) || inFootprint(o, px, py)),
        );
        if (!others) {
          clear = [px, py];
          break;
        }
      }
    }
    if (clear) {
      const p = await pickAtWorld(clear[0], clear[1]);
      if (p.building === name) fail(`pick: transparent pixel of ${name} at (${clear}) still picks the building`);
    }

    await page.evaluate((n) => window.__playtestQa.frameDoorForQa(n), name);
    await wait(60);
    const door = await page.evaluate((n) => {
      const q = window.__playtestQa;
      const p = q.doorScreenPoint(n);
      return p ? q.pickAt(p.x, p.y) : null;
    }, name);
    if (door?.door !== name) fail(`pick: door tap point of ${name} picked door ${door?.door ?? 'none'}`);
    checked++;
  }
  notes.push(`picks: ${checked} buildings — sprite top picks the building, a transparent pixel inside its frame does not, the door point picks its door`);
}

const DIFF_VIEWS = [
  { tag: '1280@1x z1.0', width: 1280, height: 800, dpr: 1, zoom: 1 },
  { tag: '375@2x z0.5', width: 375, height: 812, dpr: 2, zoom: 0.5 },
];
const diffTable = [];

/** Each item drawn alone vs its @1x export (1 device px = 1 export px in both views), masked by alpha > 128. */
async function fullFrameDiff(browser) {
  for (const vp of DIFF_VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
    const page = await ctx.newPage();
    try {
      await openMap(page);
      await page.addStyleTag({ content: '#ui-root{visibility:hidden !important}' });
      await page.evaluate(async () => {
        await window.__playtestQa.loadAllSprites();
        await window.__playtestQa.forceBuildingState('default');
      });
      await page.evaluate(() => window.__playtestQa.setCharacterTile(46, 30));
      const instances = await page.evaluate(() => window.__playtestQa.spriteInstances());
      for (const id of ITEMS) {
        const inst = instances.find((i) => i.id === id);
        if (!inst) continue;
        const a = A[inst.key];
        const grab = async (ids) => {
          await page.evaluate(
            ([i, cx, cy, z]) => {
              window.__playtestQa.isolateSprites(i);
              window.__playtestQa.frameWorld(cx, cy, z);
            },
            [ids, inst.tl.x + a.w / 2, inst.tl.y + a.h / 2, vp.zoom],
          );
          await wait(80);
          const c0 = await page.evaluate(([x, y]) => window.__playtestQa.worldToClient(x, y), [inst.tl.x, inst.tl.y]);
          const x0 = Math.max(0, c0.x);
          const y0 = Math.max(0, c0.y);
          const x1 = Math.min(vp.width, c0.x + a.w * vp.zoom);
          const y1 = Math.min(vp.height, c0.y + a.h * vp.zoom);
          const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
          const png = PNG.sync.read(await page.screenshot({ clip }));
          return { png, ox: Math.round((x0 - c0.x) / vp.zoom), oy: Math.round((y0 - c0.y) / vp.zoom), c0 };
        };
        const drawn = await grab([id]);
        const bg = await grab([]);
        const scene = await grab(null);
        const ref = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'public/sprites', a.f1)));
        let n = 0;
        let off = 0;
        const sum = [0, 0, 0];
        const sceneSum = [0, 0, 0];
        for (let v = 0; v < drawn.png.height; v++) {
          for (let u = 0; u < drawn.png.width; u++) {
            const rx = u + drawn.ox;
            const ry = v + drawn.oy;
            if (rx >= ref.width || ry >= ref.height) continue;
            const ri = (ry * ref.width + rx) * 4;
            const al = ref.data[ri + 3];
            if (al <= 128) continue;
            const si = (v * drawn.png.width + u) * 4;
            let worst = 0;
            for (let ch = 0; ch < 3; ch++) {
              const want = (ref.data[ri + ch] * al + bg.png.data[si + ch] * (255 - al)) / 255;
              const d = Math.abs(drawn.png.data[si + ch] - want);
              sum[ch] += d;
              if (d > worst) worst = d;
              sceneSum[ch] += Math.abs(scene.png.data[si + ch] - ref.data[ri + ch]);
            }
            if (worst > 60) off++;
            n++;
          }
        }
        const mean = sum.map((s) => s / Math.max(1, n));
        const row = {
          view: vp.tag,
          item: id.split('/')[1],
          mean: Math.max(...mean),
          offPct: (100 * off) / Math.max(1, n),
          inSitu: Math.max(...sceneSum.map((s) => s / Math.max(1, n))),
          px: n,
          coverage: n / Math.max(1, [...Array(ref.width * ref.height).keys()].filter((i) => ref.data[i * 4 + 3] > 128).length),
          subpx: drawn.c0.x * vp.dpr % 1 !== 0 || drawn.c0.y * vp.dpr % 1 !== 0,
        };
        diffTable.push(row);
        if (!(row.mean < 6) || !(row.offPct < 1)) {
          fail(`diff ${vp.tag}: ${row.item} mean ${row.mean.toFixed(2)}/255, ${row.offPct.toFixed(2)}% px off by >60 (need <6 and <1%)`);
        }
      }
    } finally {
      await page.evaluate(async () => {
        window.__playtestQa.isolateSprites(null);
        await window.__playtestQa.forceBuildingState(null);
      }).catch(() => {});
      await ctx.close();
    }
  }
  const lines = diffTable.map(
    (r) =>
      `  ${r.view.padEnd(13)} ${r.item.padEnd(9)} mean ${r.mean.toFixed(2).padStart(5)}/255  off>60 ${r.offPct.toFixed(2).padStart(5)}%  in-map ${r.inSitu.toFixed(1).padStart(5)}/255  px ${String(r.px).padStart(6)}  coverage ${(r.coverage * 100).toFixed(0)}%${r.subpx ? '  (sub-pixel origin)' : ''}`,
  );
  notes.push(`full-frame alpha-masked diff vs @1x export (pass: mean < 6/255 and < 1% px off by > 60):\n${lines.join('\n')}`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'pixel-diff.json'), JSON.stringify(diffTable, null, 1) + '\n');
}

async function enterRoom(page, name) {
  await page.evaluate((n) => window.__playtestQa.enterInterior(n), name);
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => window.__playtestQa.isInInterior())) break;
    await wait(250);
  }
  await wait(800);
}

async function interiorChecks(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const c of [...CASES, ...Object.keys(ART_ROOMS)]) {
      await openMap(page);
      await enterRoom(page, c);
      const layout = await page.evaluate(() => window.__playtestQa.interiorLayout());
      const rows = ART_ROOMS[c]?.mask ?? sprites.meta[`int/${c}`].mascara_caminable.filas_y0_a_y5;
      const { free, exit } = maskCells(rows);
      if (ART_ROOMS[c] && !allConnected(free, exit)) fail(`interior ${c}: not every free cell connects to the exit`);
      if (!layout) {
        fail(`interior ${c}: no layout`);
        continue;
      }
      const got = new Set(layout.walkable.map((t) => `${t.x},${t.y}`));
      const extra = [...got].filter((k) => !free.has(k));
      const lost = [...free].filter((k) => !got.has(k));
      if (extra.length || lost.length) {
        fail(`interior ${c}: walk grid != mask (extra walkable ${extra.join(' ')}; blocked but free in mask ${lost.join(' ')})`);
      }
      if (layout.exit.x !== exit.x || layout.exit.y !== exit.y) fail(`interior ${c}: exit ${layout.exit.x},${layout.exit.y} != mask S ${exit.x},${exit.y}`);
      if (!got.has(`${exit.x},${exit.y}`)) fail(`interior ${c}: exit mat tile is not walkable`);

      // Rooms clamp zoom to fit the room, which sits above the lejos band: detail at every zoom.
      for (const [label, zoom] of [['cerca', null], ['min-zoom', 0.01]]) {
        if (zoom) {
          await page.evaluate((z) => window.__playtestQa.frameWorld(0, 0, z), zoom);
          await wait(120);
          const d = await page.evaluate(() => ({ ...document.getElementById('game-canvas').dataset }));
          if (d.lod !== 'cerca') fail(`interior ${c}: room min zoom ${Number(d.zoom).toFixed(3)} shows ${d.lod} (want cerca)`);
        }
        const pr = await page.evaluate(() => window.__playtestQa.interiorPixelProbes());
        if (!pr.length) {
          fail(`interior ${c} ${label}: no probes`);
          continue;
        }
        const cols = await page.evaluate((p) => window.__playtestQa.sampleCanvasColors(p), pr.map((p) => ({ x: p.x, y: p.y })));
        let bad = 0;
        pr.forEach((p, i) => {
          const c0 = cols[i];
          const d = Math.min(...p.expect.map((hex) => (c0 ? Math.abs(c0.r - ((hex >> 16) & 255)) + Math.abs(c0.g - ((hex >> 8) & 255)) + Math.abs(c0.b - (hex & 255)) : 999)));
          if (d > (zoom ? 60 : 36)) bad++;
        });
        if (bad > Math.floor(pr.length * 0.15)) fail(`interior ${c} ${label}: ${bad}/${pr.length} probes off`);
      }
      await page.evaluate(() => window.__playtestQa.exitInterior());
      await wait(300);
    }
    notes.push(`interiors: ${CASES.join(', ')} walk grid == mascara_caminable; ${Object.keys(ART_ROOMS).join(', ')} == interior-rooms.json (all free cells reach the exit); exit mat walkable, cerca probes at default and room min zoom`);

    // Estudio noche: dark floor, amber only on lights (windows, monitor, lamp).
    await openMap(page);
    await enterRoom(page, 'estudio');
    const pr = await page.evaluate(() => window.__playtestQa.interiorPixelProbes());
    const cols = await page.evaluate((p) => window.__playtestQa.sampleCanvasColors(p), pr.map((p) => ({ x: p.x, y: p.y })));
    pr.forEach((p, i) => {
      const c0 = cols[i];
      const d = Math.min(...p.expect.map((hex) => (c0 ? Math.abs(c0.r - ((hex >> 16) & 255)) + Math.abs(c0.g - ((hex >> 8) & 255)) + Math.abs(c0.b - (hex & 255)) : 999)));
      if (d > 36) fail(`interior estudio: probe ${p.label} is ${JSON.stringify(c0)}`);
    });
    const est = await page.evaluate(() => window.__playtestQa.interiorLayout());
    const floorPts = [];
    const ch = await page.evaluate(() => window.__playtestQa.interiorCharTile());
    // Adonay and Pantone stand on the floor; skip whatever they cover.
    const avatarBoxes = await page.evaluate(() => {
      const q = window.__playtestQa;
      const a = q.playerAvatar();
      return [a.adonay, a.pantone].map((w) => {
        const p0 = q.worldToClient(w.x - w.worldW / 2, w.y - w.worldH);
        const p1 = q.worldToClient(w.x + w.worldW / 2, w.y + 6);
        return { x0: p0.x - 2, y0: p0.y - 2, x1: p1.x + 2, y1: p1.y + 2 };
      });
    });
    for (const t of est.walkable) {
      if ((t.x === est.exit.x && t.y === est.exit.y) || t.x + t.y < 4 || (t.x === ch.x && t.y === ch.y)) continue;
      const pt = await page.evaluate(([x, y]) => window.__playtestQa.interiorTileScreenPoint(x, y), [t.x, t.y]);
      if (avatarBoxes.some((b) => pt.x >= b.x0 && pt.x <= b.x1 && pt.y >= b.y0 && pt.y <= b.y1)) continue;
      floorPts.push(pt);
    }
    const fc = await page.evaluate((p) => window.__playtestQa.sampleCanvasColors(p), floorPts);
    const NOCHE = [0x1a1c20, 0x1d1f24, 0x2a2d33];
    fc.forEach((c0, i) => {
      const d = Math.min(...NOCHE.map((hex) => (c0 ? Math.abs(c0.r - ((hex >> 16) & 255)) + Math.abs(c0.g - ((hex >> 8) & 255)) + Math.abs(c0.b - (hex & 255)) : 999)));
      if (d > 24) fail(`interior estudio: floor at ${Math.round(floorPts[i].x)},${Math.round(floorPts[i].y)} is ${JSON.stringify(c0)}, not the Estudio-noche tile`);
    });
    await page.evaluate(() => window.__playtestQa.exitInterior());
    await wait(300);
    notes.push(`interiors: estudio uses the Estudio-noche palette (${fc.length} floor samples, ${pr.length} wall/window/desk/monitor probes)`);

    // One real click on the exit mat leaves every room at once.
    for (const c of ['estudio', ...CASES, ...Object.keys(ART_ROOMS)]) {
      await openMap(page);
      await enterRoom(page, c);
      const lay = await page.evaluate(() => window.__playtestQa.interiorLayout());
      const pt = await page.evaluate(([x, y]) => window.__playtestQa.interiorTileScreenPoint(x, y), [lay.exit.x, lay.exit.y]);
      await armExitTimer(page);
      await page.mouse.click(pt.x, pt.y);
      const r = await readExitTimer(page, 3000);
      if (!exitIsImmediate(r)) fail(`interior ${c}: click on exit mat was not immediate (${describeExit(r)}; need no walk and <= 150 ms, or <= 6 frames and 2.5 s)`);
      if (!r) await page.evaluate(() => window.__playtestQa.exitInterior());
      await wait(300);
    }
    notes.push('interiors: one click on the exit mat leaves each of the 9 rooms without walking (<= 150 ms, or <= 6 frames and 2.5 s on slow renderers)');
  } finally {
    await page.close();
  }
}

async function shots(browser) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const vp of [
    { tag: 'desk', width: 1280, height: 800, dpr: 1 },
    { tag: '375', width: 375, height: 812, dpr: 2 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
    const page = await ctx.newPage();
    for (const c of CASES) {
      await openMap(page);
      await enterRoom(page, c);
      await page.screenshot({ path: path.join(OUT, `interior-${c}-${vp.tag}.png`) });
      await page.evaluate(() => window.__playtestQa.exitInterior());
      await wait(300);
    }
    await openMap(page);
    const houses = await page.evaluate(() => window.__playtestQa.getEnterableBuildings());
    for (const b of houses) {
      const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), b.name);
      if (!pt) continue;
      await page.evaluate((n) => window.__playtestQa.frameDoorForQa(n), b.name);
      await wait(300);
      await page.screenshot({ path: path.join(OUT, `exterior-${b.name}-${vp.tag}.png`) });
    }
    await page.evaluate(() => window.__playtestQa.setCharacterTile(17, 36));
    for (const [name, x, y, z] of [
      ['obelisco', -1344, 1480, 1.0],
      ['obelisco-lejos', -1344, 1480, await lejosZoom(page)],
      ['calles', -1344, 1700, 0.8],
    ]) {
      await page.evaluate(([a, b, zz]) => window.__playtestQa.frameWorld(a, b, zz), [x, y, z]);
      await wait(300);
      await page.screenshot({ path: path.join(OUT, `mapa-${name}-${vp.tag}.png`) });
    }
    await ctx.close();
  }
}

staticChecks();

let preview = null;
if (!process.env.QA_BASE_URL) {
  // Run vite itself (not through npx) so killing `preview` stops the server.
  preview = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
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

/** Logs each part as it ends, so a CI step that times out still shows how far it got. */
async function part(name, fn) {
  const t = Date.now();
  await fn();
  console.log(`qa-sprites: ${name} ${((Date.now() - t) / 1000).toFixed(0)} s`);
}

const browser = await launchBrowser(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await openMap(page);
  const gl = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('webgl2');
    const info = ctx?.getExtension('WEBGL_debug_renderer_info');
    return info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'no WebGL2';
  });
  console.log(`qa-sprites: WebGL renderer ${gl}`);
  if (want('placement')) await part('placement', () => placementChecks(page));
  if (want('picks')) await part('picks', () => pickChecks(page));
  if (want('map')) await part('map', () => mapChecks(page));
  if (want('diff')) await part('pixel-diff', () => pixelDiffMap(page));
  await page.close();
  if (want('diff')) await part('full-frame diff', () => fullFrameDiff(browser));
  if (want('interiors')) await part('interiors', () => interiorChecks(browser));
  if (SHOTS && want('shots')) await part('shots', () => shots(browser));
} finally {
  await browser.close();
  preview?.kill('SIGKILL');
}

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  console.error(`\n${errors.length} sprite check(s) failed`);
  process.exit(1);
}
console.log('qa-sprites: all checks passed');
