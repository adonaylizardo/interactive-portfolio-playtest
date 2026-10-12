/**
 * Run #39 sprite verification (Forge pack r39d).
 *
 *  - static: tokens (no world/bloom), PNG sizes vs sprites.json, manifest door checks, case masks
 *  - pixel-diff: every sprite on the map (buildings x 3 states, props, tiles) at cerca + lejos, drawn
 *    alone on the canvas and compared with the probe colours measured from the PNG
 *  - map data: street variants vs neighbours, door faces vs manifest `puerta.verificacion`,
 *    obelisco collision strip from the manifest `colision`
 *  - case interiors: walk grid == `mascara_caminable`, exit mat walkable, probes at cerca + lejos
 *  - `--shots`: writes artifacts/run39 screenshots (case interiors desktop + 375, exteriors)
 *
 * Usage: npm run qa:sprites [-- --shots]   (builds first; QA_BASE_URL skips the local preview server)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4192;
const BASE =
  process.env.QA_BASE_URL ?? `http://127.0.0.1:${PREVIEW_PORT}/interactive-portfolio-playtest/`;
const SHOTS = process.argv.includes('--shots');
const OUT = path.join(ROOT, 'artifacts', 'run39');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'];
const sprites = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/sprites.json'), 'utf8'));
const probes = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/sprites/probes.json'), 'utf8'));
const A = sprites.assets;

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
  const col = sprites.meta['prop/obelisco']?.colision?.solida?.celdas;
  const want = [[15, 35], [15, 36], [15, 37]];
  if (JSON.stringify(col) !== JSON.stringify(want)) {
    fail(`static: obelisco manifest colision.solida is ${JSON.stringify(col)}`);
  }
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
    (o) => {
      const q = window.__playtestQa;
      if (o.id) {
        q.forceBuildingState(o.state);
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
    const drawn = cols.filter((c) => c && Math.abs(c.r - BG[0]) + Math.abs(c.g - BG[1]) + Math.abs(c.b - BG[2]) > 12).length;
    if (drawn < pr.length * 0.7) fail(`pixel: ${key} thin sprite drawn at only ${drawn}/${pr.length} opaque points`);
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

async function pixelDiffMap(page) {
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
          zoom: lod === 'cerca' || !probes[key]?.length ? 1 : 0.3,
          id: inst.id,
          state,
        });
      }
    }
  }
  await page.evaluate(() => {
    window.__playtestQa.isolateSprites(null);
    window.__playtestQa.forceBuildingState(null);
  });

  const unplaced = [...fullCoverage].filter((k) => !covered.has(k));
  for (const key of unplaced) {
    await diffSprite(page, {
      key,
      tlx: -A[key].vfs.x,
      tly: -A[key].vfs.y,
      zoom: key.endsWith('/lejos') && probes[key]?.length ? 0.3 : 1,
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

  const pathCells = (p) => (p ? p.map((c) => `${c.x},${c.y}`) : null);
  for (const [x, y] of [[15, 35], [15, 36], [15, 37]]) {
    const p = await page.evaluate(([a, b]) => window.__playtestQa.findPath(14, 34, a, b), [x, y]);
    if (p) fail(`obelisco: solid cell (${x},${y}) is reachable`);
  }
  for (const [x, y] of [[14, 35], [14, 36], [14, 37], [16, 35], [16, 36], [16, 37]]) {
    const p = await page.evaluate(([a, b]) => window.__playtestQa.findPath(14, 34, a, b), [x, y]);
    if (!p) fail(`obelisco: plaza cell (${x},${y}) is not walkable`);
  }
  const around = await page.evaluate(() => window.__playtestQa.findPath(14, 36, 16, 36));
  if (!around) fail('obelisco: no way around the strip from (14,36) to (16,36)');
  else if (pathCells(around).includes('15,36')) fail('obelisco: path crosses the solid strip');
  notes.push('doors: 5 case houses match manifest puerta.verificacion; obelisco: 3 solid cells, 6 plaza cells walkable');
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
    for (const c of CASES) {
      await openMap(page);
      await enterRoom(page, c);
      const layout = await page.evaluate(() => window.__playtestQa.interiorLayout());
      const rows = sprites.meta[`int/${c}`].mascara_caminable.filas_y0_a_y5;
      const { free, exit } = maskCells(rows);
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

      for (const [label, zoom] of [['cerca', null], ['lejos', 0.3]]) {
        if (zoom) {
          await page.evaluate((z) => window.__playtestQa.frameWorld(0, 0, z), zoom);
          await wait(120);
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
    notes.push(`interiors: ${CASES.join(', ')} walk grid == mascara_caminable, exit mat walkable, probes cerca + lejos`);
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
    for (const [name, x, y, z] of [
      ['obelisco', 1420, -1580, 1.0],
      ['calles', 1420, -1100, 0.8],
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
  preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
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

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await openMap(page);
  await mapChecks(page);
  await pixelDiffMap(page);
  await page.close();
  await interiorChecks(browser);
  if (SHOTS) await shots(browser);
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
