// r45g tap-to-park probe: Volaris repro (r45f MED-1), unreachable (22,18), reachable road tile. Real taps only.
// usage: node park2.mjs <vp> <url> <out>
import fs from 'node:fs';
import { chromium } from 'playwright';
const vp = process.argv[2], BASE = process.argv[3], OUT = process.argv[4]; const phone = vp !== '1440';
const ctxOpt = phone ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...ctxOpt, recordVideo: { dir: `${OUT}/video`, size: ctxOpt.viewport } }); const p = await ctx.newPage();
const R = { vp, ce: [], tests: [] }; p.on('console', (m) => { if (m.type() === 'error') R.ce.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => R.ce.push(String(e).slice(0, 200)));
const tap = (x, y) => (phone ? p.touchscreen.tap(Math.round(x), Math.round(y)) : p.mouse.click(Math.round(x), Math.round(y)));
const rectOf = (sel) => p.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && !e.closest('[hidden]'); }); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
const jac = () => p.evaluate(() => window.__playtestQa.jac());
const shot = (n) => p.screenshot({ path: `${OUT}/shots/${vp}-${n}.png` }).catch(() => {});
const truckXY = () => p.evaluate(() => { const e = window.__playtestQa.jacEntities(); const c = document.getElementById('game-canvas').getBoundingClientRect(); return [c.left + e.sx, c.top + e.sy - 20]; });
await p.goto(BASE + '?qa=1&focus=jac'); await p.waitForSelector('[data-boot-start]', { state: 'visible', timeout: 90000 }); await W(1500);
const bs = await rectOf('[data-boot-start]'); await tap(bs.x, bs.y); await W(2500);
const getIn = async () => { for (let i = 0; i < 2; i++) { const t = await truckXY(); await tap(t[0], t[1]); await W(1500); const r = await rectOf('[data-jac="in"]'); if (r) await tap(r.x, r.y); await W(1500); if ((await jac()).driving) break; } await p.waitForFunction(() => window.__playtestQa.jac()?.driving, null, { timeout: 10000 }).catch(() => {}); return (await jac()).driving; };
// recorder
await p.evaluate(() => { window.__P = []; const f = () => { const q = window.__playtestQa; const j = q.jac(); const tst = document.getElementById('playtest-toast'); const tOn = tst && +getComputedStyle(tst).opacity > 0.1 && tst.getClientRects().length;
  const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden');
  const card = vis('.place-card, .building-panel'); const dock = vis('.jac-dock') || vis('.jac-bar'); let ov = 0; if (card && dock) { const a = card.getBoundingClientRect(), c = dock.getBoundingClientRect(); ov = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)); }
  window.__P.push([Math.round(performance.now()), +j.cx.toFixed(3), +j.cy.toFixed(3), j.dir, +j.vel.toFixed(2), j.mode, j.pathN ?? 0, +j.heading.toFixed(3), j.driving ? 1 : 0, tOn ? tst.textContent.trim().slice(0, 50) : null, card ? 1 : 0, Math.round(ov), q.jacFootprintBlocked() ? 1 : 0]); requestAnimationFrame(f); }; requestAnimationFrame(f); });
// tile -> client screen: fit zoom from door points, anchor on truck
const tileScreen = (tx, ty) => p.evaluate(([tx, ty]) => {
  const q = window.__playtestQa; const A = { estudio: [31, 36], volaris: [39, 36], bain: [39, 26], mentoria: [32, 26], finoa: [24, 24], pg: [24, 31], sambil: [47, 16], catedral: [14, 17], teresa: [34, 14], biblioteca: [6, 30] };
  const tw = (x, y) => ({ x: (x - y) * 64, y: (x + y) * 32 });
  const pts = Object.entries(A).map(([n, t]) => ({ s: q.doorScreenPoint(n), w: tw(t[0], t[1]) })).filter((o) => o.s);
  const mw = { x: 0, y: 0 }, ms = { x: 0, y: 0 }; pts.forEach((o) => { mw.x += o.w.x / pts.length; mw.y += o.w.y / pts.length; ms.x += o.s.x / pts.length; ms.y += o.s.y / pts.length; });
  let num = 0, den = 0; pts.forEach((o) => { num += (o.w.x - mw.x) * (o.s.x - ms.x) + (o.w.y - mw.y) * (o.s.y - ms.y); den += (o.w.x - mw.x) ** 2 + (o.w.y - mw.y) ** 2; });
  const z = num / den; const c = { x: ms.x - z * mw.x, y: ms.y - z * mw.y }; const w = tw(tx + 0.5, ty + 0.5);
  return { x: c.x + z * w.x, y: c.y + z * w.y, z };
}, [tx, ty]);
const hudTop = () => p.evaluate(() => Math.min(innerHeight, ...[...document.querySelectorAll('.jac-dock, .jac-bar, .joystick')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().top)));
const onScreen = async (pt) => pt && pt.x > 15 && pt.x < ctxOpt.viewport.width - 15 && pt.y > 70 && pt.y < (await hudTop()) - 15;
const observe = async (label, maxMs = 25000) => { const t0 = await p.evaluate(() => performance.now()); const w0 = Date.now(); let j; await W(700);
  for (;;) { j = await jac(); const idle = (j.pathN ?? 0) === 0 && Math.abs(j.vel) < 0.05; if (Date.now() - w0 > maxMs || (idle && Date.now() - w0 > 1500) || !j.driving) break; await W(250); }
  await W(800); const t1 = await p.evaluate(() => performance.now()); const P = (await p.evaluate(() => window.__P)).filter((r) => r[0] >= t0 && r[0] <= t1);
  // metrics
  let spins = [], trav = 0, maxStill = 0, stillSince = null, toasts = new Set(), cardOv = 0, card = 0, fb = 0, maxd = 0;
  for (let k = 1; k < P.length; k++) { const a = P[k - 1], c = P[k]; const d = Math.hypot(c[1] - a[1], c[2] - a[2]); trav += d; maxd = Math.max(maxd, d);
    if (c[3] !== a[3]) { if (trav < 0.3) spins.push([a[3], c[3], +trav.toFixed(2), c[1], c[2]]); trav = 0; }
    if (c[6] > 0 && Math.abs(c[4]) < 0.05) { stillSince ??= c[0]; maxStill = Math.max(maxStill, c[0] - stillSince); } else stillSince = null;
    if (c[9]) toasts.add(c[9]); if (c[10]) card = 1; cardOv = Math.max(cardOv, c[11]); if (c[12] && c[8]) fb++; }
  const r = { label, dest: await p.evaluate(() => window.__playtestQa.lastDriveTap()), track: P.filter((_, i) => i % 8 === 0).map((r) => [r[1], r[2], r[3], r[6], r[12]]), ms: Date.now() - w0, end: [+j.cx.toFixed(2), +j.cy.toFixed(2), j.dir, j.mode, j.driving, j.pathN], spins, livelockMs: maxStill, toasts: [...toasts], card, cardDockOverlapPx2: cardOv, fbFrames: fb, maxFrameDisp: +maxd.toFixed(3), frames: P.length };
  R.tests.push(r); console.log(JSON.stringify(r)); await shot(`park-${label}`); fs.writeFileSync(`${OUT}/logs/park3b-${vp}.json`, JSON.stringify(R)); return r; };
// keyboard / stick driver to approach areas
const KEY = { w: 'w', a: 'a', d: 'd' }; const held = new Set();
const setKeys = async (want) => { for (const k of [...held]) if (!want.includes(k)) { await p.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await p.keyboard.down(k); held.add(k); } };
const cdp = await ctx.newCDPSession(p); let joy = null; let down = false;
const stick = async (x, y) => { if (!joy) joy = await rectOf('.joystick'); const pt = { x: Math.round(joy.x + x * 28), y: Math.round(joy.y + y * 28), id: 1 }; if (!down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(joy.x), y: Math.round(joy.y), id: 1 }] }); down = true; } await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] }); };
const rel = async () => { if (phone) { if (down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); down = false; } else await setKeys([]); };
const driveTo = async (wps, timeoutMs = 25000) => { const t0 = Date.now(); let i = 0; while (i < wps.length && Date.now() - t0 < timeoutMs) { const j = await jac(); const [wx, wy] = wps[i]; const dist = Math.hypot(wx - j.cx, wy - j.cy); let e = Math.atan2(wy - j.cy, wx - j.cx) / (Math.PI / 2) - j.heading; e = ((((e + 2) % 4) + 4) % 4) - 2; if (dist < 1 || (dist < 1.8 && Math.abs(e) > 0.8)) { i++; continue; } const sx = Math.max(-1, Math.min(1, e * 3)); if (phone) await stick(Math.abs(sx) < 0.15 ? 0 : sx, Math.abs(e) > 0.5 ? -0.6 : -1); else await setKeys(sx > 0.25 ? ['w', 'd'] : sx < -0.25 ? ['w', 'a'] : ['w']); await W(60); } await rel(); return i >= wps.length; };
const tapTile = async (label, tx, ty) => { const pt = await tileScreen(tx, ty); R[label + 'Pt'] = pt; if (!(await onScreen(pt))) { console.log('OFFSCREEN', label, JSON.stringify(pt)); R.tests.push({ label, offscreen: pt }); return null; } await tap(pt.x, pt.y); return observe(label); };
const tapDoor = async (label, name) => { let pt = await p.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name); if (!(await onScreen(pt))) { console.log('OFFSCREEN door', name, JSON.stringify(pt)); pt = await tileScreen(...({ volaris: [39, 35], bain: [39, 27] }[name])); if (!(await onScreen(pt))) { R.tests.push({ label, offscreen: pt }); return null; } } await tap(pt.x, pt.y); return observe(label); };

const doorOn = async (n) => { const pt = await p.evaluate((n) => window.__playtestQa.doorScreenPoint(n), n); return (await onScreen(pt)) ? pt : null; };
const zoomOut = async () => { const W2 = ctxOpt.viewport.width / 2, H2 = 300; await p.mouse.move(W2, H2); await p.mouse.wheel(0, 400); await W(900); };
const parkDoor = async (label, name) => { let pt = null; for (let i = 0; i < 6 && !(pt = await doorOn(name)); i++) await zoomOut(); R[label + 'Zoom'] = (await tileScreen(20, 6)).z; if (!pt) { console.log('OFFSCREEN door', name); R.tests.push({ label, offscreen: true }); return null; } R[label + 'Pre'] = await jac().then((j) => [+j.cx.toFixed(2), +j.cy.toFixed(2), j.dir, +j.heading.toFixed(2), j.driving]); await tap(pt.x, pt.y); return observe(label, 30000); };
R.in1 = await getIn();
await tapTile('reachable-23-7', 23, 7);
if (!(await jac()).driving) await getIn();
await tapTile('unreachable-22-18', 22, 18);
if (!(await jac()).driving) await getIn();
await parkDoor('bain', 'bain');
if (!(await jac()).driving) { await W(2500); R.reInBain = await getIn(); }
await parkDoor('volaris-repro', 'volaris');
R.fps = await p.evaluate(() => { const P = window.__P; return +((P.length - 1) * 1000 / (P.at(-1)[0] - P[0][0])).toFixed(1); });
fs.writeFileSync(`${OUT}/logs/park3b-${vp}.json`, JSON.stringify(R)); const v = p.video(); await ctx.close(); await b.close(); fs.renameSync(await v.path(), `${OUT}/video/park3b-${vp}.webm`);
console.log('DONE', JSON.stringify({ fps: R.fps, ce: R.ce, bainPre: R.bainPre, volPre: R['volaris-reproPre'] }));
