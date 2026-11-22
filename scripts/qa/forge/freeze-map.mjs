// One-off: dump the drive grid of a build into frozen-drive-grid.json (used by oracle.mjs).
// usage: node scripts/qa/forge/freeze-map.mjs <bundle.mjs> <source-label>
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
globalThis.window = globalThis;
const mk = () => new Proxy(function () {}, { get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; if (!(p in t)) t[p] = mk(); return t[p]; }, set(t, p, v) { t[p] = v; return true; }, apply() { return mk(); }, construct() { return mk(); } });
const S = mk(); await import(pathToFileURL(path.resolve(process.argv[2])).href); const T = globalThis.__T;
const jac = new T.JacT9(T.objects.find((o) => o.id === 'fill/jac-t9'), { container: S, visual: new Proxy({}, { get: () => S }), tapBox: new Map(), onStuck: () => {} });
jac.setMode('drive'); // cells under the truck answer from `claimed` (their own walkability)
const open = []; for (let y = 0; y < T.MAP_HEIGHT; y++) { let r = ''; for (let x = 0; x < T.MAP_WIDTH; x++) r += jac.driveCellOpen(x, y) ? '1' : '0'; open.push(r); }
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'frozen-drive-grid.json'), JSON.stringify({ source: process.argv[3], w: T.MAP_WIDTH, h: T.MAP_HEIGHT, open }, null, 0).replace(/","/g, '",\n"'));
console.log('frozen', T.MAP_WIDTH, 'x', T.MAP_HEIGHT, 'open cells', open.join('').split('1').length - 1);
