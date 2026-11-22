// r45e hostile real-input session. Input = real keyboard/mouse/CDP touch. State read-only (?qa=1) for observation
// and for the waypoint "driver" (which only chooses which real keys / stick vector to press).
// usage: node hostile.mjs <1440|375> <url> <outdir>
import fs from 'node:fs';
import { chromium } from 'playwright';
const vp = process.argv[2] || '1440'; const BASE = process.argv[3]; const OUT = process.argv[4];
for (const d of ['logs', 'shots', 'video']) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
const phone = vp !== '1440';
const ctxOpt = phone ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...ctxOpt, recordVideo: { dir: `${OUT}/video`, size: ctxOpt.viewport } });
const p = await ctx.newPage();
const R = { vp, ce: [], segs: [], notes: {} };
p.on('console', (m) => { if (m.type() === 'error') R.ce.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => R.ce.push('pageerror ' + String(e).slice(0, 300)));
const save = () => fs.writeFileSync(`${OUT}/logs/turnprobe-${vp}-${process.env.SC}.json`, JSON.stringify(R));
const shot = async (n) => { await p.screenshot({ path: `${OUT}/shots/${vp}-turn-${n}.png`, timeout: 60000 }).catch(() => {}); };
const cdp = await ctx.newCDPSession(p);
const tap = async (x, y) => (phone ? p.touchscreen.tap(Math.round(x), Math.round(y)) : p.mouse.click(Math.round(x), Math.round(y)));
const rectOf = (sel) => p.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; }); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
const tapSel = async (sel) => { const r = await rectOf(sel); if (!r) return null; await tap(r.x, r.y); return r; };
const jac = () => p.evaluate(() => window.__playtestQa.jac());
await p.goto(BASE + '?qa=1&focus=jac', { waitUntil: 'load' });
await p.waitForSelector('[data-boot-start]', { state: 'visible', timeout: 90000 }).catch(() => {});
await W(1500); await tapSel('[data-boot-start]'); await W(2500);
await p.evaluate(() => {
  window.__R = []; window.__seg = 'boot'; window.__k = new Set();
  addEventListener('keydown', (e) => window.__k.add(e.key.toLowerCase()), true); addEventListener('keyup', (e) => window.__k.delete(e.key.toLowerCase()), true);
  const ang = (el) => { if (!el) return null; const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/); if (!m) return null; const [a, b] = m[1].split(',').map(Number); return +(Math.atan2(b, a) * 180 / Math.PI).toFixed(1); };
  const f = () => {
    const q = window.__playtestQa; let j = null; try { j = q.jac(); } catch {}
    let jq = null; try { jq = q.joystick?.(); } catch {}
    const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length && !e.closest('[hidden]'));
    const g0 = vis('[data-jac="gear"]'); if (g0 && !g0.__id) { window.__gid = (window.__gid || 0) + 1; g0.__id = window.__gid; }
    const tst = document.getElementById('playtest-toast'); const tOn = tst && +getComputedStyle(tst).opacity > 0.1 && tst.getClientRects().length;
    const dock = vis('.jac-dock') || vis('.jac-bar');
    if (j && window.__R.length < 80000) window.__R.push([
      Math.round(performance.now()), window.__seg, +j.cx.toFixed(3), +j.cy.toFixed(3), +j.heading.toFixed(4), j.dir, +j.vel.toFixed(3), j.gear, j.driving ? 1 : 0, j.mode,
      vis('[data-mph]')?.textContent ?? null, vis('[data-rpm]')?.textContent ?? null, ang(vis('.jac-gauge--rpm .jac-gauge__needle')), ang(vis('.jac-gauge--mph .jac-gauge__needle')),
      g0?.__id ?? null, dock?.classList.contains('is-bump') ? 1 : 0, dock ? getComputedStyle(dock).backgroundColor : null,
      jq ? (jq.visible ? 1 : 0) : null, jq ? (jq.active ? 1 : 0) : null, jq ? +jq.x.toFixed(2) : null, jq ? +jq.y.toFixed(2) : null,
      (window.__k.has('w') || window.__k.has('arrowup') ? -1 : 0) + (window.__k.has('s') || window.__k.has('arrowdown') ? 1 : 0), (window.__k.has('d') || window.__k.has('arrowright') ? 1 : 0) - (window.__k.has('a') || window.__k.has('arrowleft') ? 1 : 0),
      tOn ? tst.textContent.trim().slice(0, 60) : null, j.pathN ?? 0, q.jacFootprintBlocked?.() ? 1 : 0,
    ]);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
R.cols = ['t', 'seg', 'cx', 'cy', 'heading', 'dir', 'vel', 'gear', 'driving', 'mode', 'mph', 'rpm', 'rpmDeg', 'mphDeg', 'gearElId', 'bump', 'dockBg', 'joyVis', 'joyActive', 'joyX', 'joyY', 'keyY', 'keyX', 'toast', 'pathN', 'fb'];
const seg = async (name, fn) => {
  await p.evaluate((n) => { window.__seg = n; }, name);
  const t0 = await p.evaluate(() => performance.now()); let err = null, out = null;
  try { out = await fn(); } catch (e) { err = String(e).slice(0, 200); }
  const t1 = await p.evaluate(() => performance.now());
  const j = await jac().catch(() => null);
  R.segs.push({ name, t0: Math.round(t0), t1: Math.round(t1), err, out, end: j && [+j.cx.toFixed(2), +j.cy.toFixed(2), +j.heading.toFixed(2), j.dir, j.gear, j.driving] }); save();
  console.log(name, JSON.stringify(R.segs.at(-1).end), err || '', out ? JSON.stringify(out).slice(0, 200) : '');
};
const truckXY = () => p.evaluate(() => { const e = window.__playtestQa.jacEntities(); const c = document.getElementById('game-canvas').getBoundingClientRect(); return [c.left + e.sx, c.top + e.sy - 20]; });
const getIn = async () => { const t = await truckXY(); await tap(t[0], t[1]); await W(1500); let r = await tapSel('[data-jac="in"]'); if (!r) { const t2 = await truckXY(); await tap(t2[0], t2[1]); await W(1500); r = await tapSel('[data-jac="in"]'); } await p.waitForFunction(() => window.__playtestQa.jac()?.driving, null, { timeout: 20000 }).catch(() => {}); await W(1200); return { via: r ? 'in-button' : 'FAILED', driving: (await jac()).driving }; };
// ---- input primitives
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
let joy = null, down = false;
const getJoy = async () => (joy = await rectOf('.joystick'));
const stick = async (dx, dy, extra = []) => { if (!joy) await getJoy(); if (!joy) throw new Error('joystick not visible'); const pt = tp(joy.x + dx * 28, joy.y + dy * 28, 1); if (!down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x, joy.y, 1), ...extra] }); down = true; await W(30); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt, ...extra] }); };
const release = async () => { if (down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); down = false; } };
const KEY = { up: 'w', down: 's', left: 'a', right: 'd' };
const held = new Set();
const setKeys = async (want) => { for (const k of [...held]) if (!want.includes(k)) { await p.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await p.keyboard.down(k); held.add(k); } };
// input(x,y): x steer -1..1, y gas -1 (forward) .. +1 (brake)
const input = async (x, y) => { if (phone) { if (x === 0 && y === 0) return release(); return stick(x, y); } const k = []; if (y < -0.2) k.push('w'); if (y > 0.2) k.push('s'); if (x > 0.25) k.push('d'); if (x < -0.25) k.push('a'); await setKeys(k); };
const stop = async () => { if (phone) await release(); else await setKeys([]); };
const hold = async (x, y, ms) => { const n = Math.max(1, Math.round(ms / 60)); for (let i = 0; i < n; i++) { await input(x + (phone ? (i % 2 ? 0.01 : -0.01) : 0), y); await W(60); } await stop(); };
const circle = async (ms, turns = 1) => { const n = Math.round(ms / 60); for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2 * turns; await input(Math.cos(a), Math.sin(a) > 0.2 ? Math.sin(a) : Math.min(-0.5, Math.sin(a))); await W(60); } await stop(); };
const gear = async (g) => { const r = await tapSel(`[data-jac="gear"][data-val="${g}"]`); await W(350); return !!r; };
// waypoint driver: chooses real keys / stick vectors from observed pose; logs stalls
const driveTo = async (wps, { timeoutMs = 25000, arrive = 0.9 } = {}) => {
  const t0 = Date.now(); let i = 0; let restSince = null; let stalls = 0; let pose;
  while (i < wps.length && Date.now() - t0 < timeoutMs) {
    pose = await jac(); const [wx, wy] = wps[i]; const dx = wx - pose.cx, dy = wy - pose.cy; const dist = Math.hypot(dx, dy);
    let e = Math.atan2(dy, dx) / (Math.PI / 2) - pose.heading; e = ((((e + 2) % 4) + 4) % 4) - 2;
    if (dist < arrive || (dist < 1.8 && Math.abs(e) > 0.8)) { i++; continue; }
    if (Math.abs(pose.vel) < 0.2 && Date.now() - t0 > 700) { restSince ??= Date.now(); } else restSince = null;
    const pinned = restSince && Date.now() - restSince > 600;
    if (pinned && Date.now() - restSince > 4000) { stalls++; restSince = null; await stop(); await gear('R'); await hold(e > 0 ? -1 : 1, -1, 900); await gear('D'); continue; } // like a human: back up after 4 s stuck
    const sx = pinned ? (e < 0 ? -0.8 : 0.8) : Math.max(-1, Math.min(1, e * 3));
    await input(Math.abs(sx) < 0.15 ? 0 : sx, Math.abs(e) > 0.5 ? -0.6 : -1); await W(60);
  }
  await stop(); return { reached: i >= wps.length, wp: i, stallsNeedingR: stalls, at: pose && [+pose.cx.toFixed(2), +pose.cy.toFixed(2), pose.dir] };
};
const doorTap = async (name) => { const pt = await p.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name); if (!pt) return { name, pt: null }; await tap(pt.x ?? pt[0], pt.y ?? pt[1]); const t0 = Date.now(); let j; for (;;) { await W(500); j = await jac(); if (Date.now() - t0 > 25000 || (!j.driving && Date.now() - t0 > 1500) || (j.pathN === 0 && Math.abs(j.vel) < 0.05 && Date.now() - t0 > 3000)) break; } return { name, pt, ms: Date.now() - t0, end: [+j.cx.toFixed(2), +j.cy.toFixed(2), j.dir, j.mode, j.driving, j.gear] }; };

// ============ session ============
// ===== r45i turnprobe: normal-play turns, steer-into-prop stops, and escapes (real keys / CDP stick only)
const until = async (pred, ms, x, y) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const j = await jac(); if (pred(j)) return true; await input(x, y); await W(40); } return false; };
const reboot = async () => { await stop(); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('[data-boot-start]', { state: 'visible', timeout: 90000 }).catch(() => {}); await W(1500); await tapSel('[data-boot-start]'); await W(2500); joy = null;
  await p.evaluate(() => { if (!window.__R) location.reload(); }); };
const install = async () => p.evaluate(() => true);
const after = async (name) => { await shot(name); };
const escape = async (s) => { // a player who sees the cue: let go, tap R, back up straight, tap D, drive off steering away
  const j0 = await jac(); await stop(); await W(300); await gear('R'); await hold(0, -1, 2000); const j1 = await jac(); await gear('D'); await hold(-s, -1, 2500); const j2 = await jac();
  return { start: [+j0.cx.toFixed(2), +j0.cy.toFixed(2), j0.dir], afterR: [+j1.cx.toFixed(2), +j1.cy.toFixed(2), j1.dir], afterD: [+j2.cx.toFixed(2), +j2.cy.toFixed(2), j2.dir], dispR: +Math.hypot(j1.cx - j0.cx, j1.cy - j0.cy).toFixed(2), dispTotal: +Math.hypot(j2.cx - j0.cx, j2.cy - j0.cy).toFixed(2) }; };
const steerOnly = async (s) => { const j0 = await jac(); await hold(-s, -1, 3000); const j1 = await jac(); return { dispOppSteerD: +Math.hypot(j1.cx - j0.cx, j1.cy - j0.cy).toFixed(2) }; };
const scenarios = [
  ['A-spawn-W-then-W+D', async () => { await until((j) => j.cx >= 22, 4000, 0, -1); await hold(1, -1, 2500); return { at: (await jac()).cx }; }],
  ['B-spawn-W-then-W+A', async () => { await until((j) => j.cx >= 22, 4000, 0, -1); await hold(-1, -1, 2500); return {}; }],
  ['C-street-W-then-W+D', async () => { await until((j) => j.cx >= 28, 6000, 0, -1); await hold(1, -1, 3000); const s1 = await jac(); await hold(0, -1, 2000); const s2 = await jac(); return { stopAt: [s1.cx, s1.cy, s1.dir], afterReleaseSteer: +Math.hypot(s2.cx - s1.cx, s2.cy - s1.cy).toFixed(2) }; }],
  ['D-porch-route', async () => { const r = await driveTo([[37, 8], [37, 16], [37, 25]], { timeoutMs: 30000 }); await hold(-1, -1, 3000); await after('D-steer-into'); const e = await escape(-1); return { r, e }; }],
  ['E-cactus-route', async () => { const r = await driveTo([[30, 19], [27, 18.5]], { timeoutMs: 25000 }); await hold(-0.8, -1, 3000); await after('E-steer-into'); const o = await steerOnly(-1); const e = await escape(-1); return { r, o, e }; }],
  ['F-x30-W-then-right', async () => { await until((j) => j.cx >= 30, 7000, 0, -1); const j0 = await jac(); await hold(1, -1, 2500); const j1 = await jac(); let dh = j1.heading - j0.heading; dh = ((((dh + 2) % 4) + 4) % 4) - 2; return { from: [j0.cx, j0.cy, j0.heading], to: [j1.cx, j1.cy, j1.dir, j1.heading], dhQ: +dh.toFixed(3) }; }],
  ['G-x30-W-then-left', async () => { await until((j) => j.cx >= 30, 7000, 0, -1); const j0 = await jac(); await hold(-1, -1, 2500); const j1 = await jac(); let dh = j1.heading - j0.heading; dh = ((((dh + 2) % 4) + 4) % 4) - 2; return { from: [j0.cx, j0.cy, j0.heading], to: [j1.cx, j1.cy, j1.dir, j1.heading], dhQ: +dh.toFixed(3) }; }],
  ['H-x24-W-then-left', async () => { await until((j) => j.cx >= 24, 5000, 0, -1); const j0 = await jac(); await hold(-1, -1, 2500); const j1 = await jac(); let dh = j1.heading - j0.heading; dh = ((((dh + 2) % 4) + 4) % 4) - 2; return { dhQ: +dh.toFixed(3), to: [j1.cx, j1.cy, j1.dir] }; }],
  ['I-stick-range', async () => { if (!phone) return 'n/a'; await getJoy(); const out = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0.7, -0.7], [-0.7, -0.7], [1.6, 0], [-1.6, 0], [1, -1], [-1, -1]]) { await stick(dx, dy); await W(250); const q = await p.evaluate(() => window.__playtestQa.joystick?.()); const j = await jac(); out.push({ dx, dy, jx: q && +q.x.toFixed(3), jy: q && +q.y.toFixed(3), steering: j.steering }); await release(); await W(300); } return { joy, out }; }],
];
for (const [name, fn] of scenarios.filter(([n]) => n.startsWith(process.env.SC))) {
  await seg(`${name}-getin`, getIn);
  await p.evaluate(() => { window.__seg = 'x'; });
  await seg(name, fn); await shot(name);
}
R.frames = await p.evaluate(() => window.__R); save();
const vid = p.video(); await ctx.close(); await b.close(); fs.renameSync(await vid.path(), `${OUT}/video/turnprobe-${vp}-${process.env.SC}.webm`);
console.log('DONE', vp, 'ce', R.ce.length);
