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
const save = () => fs.writeFileSync(`${OUT}/logs/pinprobe-${vp}.json`, JSON.stringify(R));
const shot = async (n) => { await p.screenshot({ path: `${OUT}/shots/${vp}-pin-${n}.png`, timeout: 60000 }).catch(() => {}); };
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
// ===== pinprobe: approach a prop, pin the nose with straight gas, then hold gas+steer and time the release (0 R taps)
const contact = async (hd, ms = 7000) => { // drive straight on heading hd (quarter-turns) until stopped by something
  const t0 = Date.now(); let still = null, j;
  while (Date.now() - t0 < ms) { j = await jac(); let e = hd - j.heading; e = ((((e + 2) % 4) + 4) % 4) - 2; await input(Math.abs(e) > 0.05 ? Math.max(-1, Math.min(1, e * 4)) : 0, -1); await W(60);
    if (Math.abs(j.vel) < 0.25 && Date.now() - t0 > 800) { still ??= Date.now(); if (Date.now() - still > 700) break; } else still = null; }
  await stop(); await W(300); j = await jac(); return { at: [+j.cx.toFixed(2), +j.cy.toFixed(2), j.dir, +j.heading.toFixed(2)], fb: await p.evaluate(() => window.__playtestQa.jacFootprintBlocked()) };
};
const pinTest = async (sx, ms = 4000) => { // hold gas+steer; free = heading moved >=0.5 qturn OR net displacement >=1.5 tiles
  const j0 = await jac(); const t0 = Date.now(); let freeMs = null, maxNet = 0, maxHd = 0, rTaps = 0;
  const n = Math.round(ms / 60);
  for (let i = 0; i < n; i++) { await input(sx + (phone ? (i % 2 ? 0.01 : -0.01) : 0), -1); await W(60); const j = await jac(); const net = Math.hypot(j.cx - j0.cx, j.cy - j0.cy); let hd = Math.abs(j.heading - j0.heading); hd = Math.min(hd, 4 - hd); maxNet = Math.max(maxNet, net); maxHd = Math.max(maxHd, hd); if (freeMs === null && (hd >= 0.5 || net >= 1.5)) freeMs = Date.now() - t0; }
  await stop(); await W(300); const j1 = await jac();
  return { start: [+j0.cx.toFixed(2), +j0.cy.toFixed(2), j0.dir, +j0.heading.toFixed(2)], end: [+j1.cx.toFixed(2), +j1.cy.toFixed(2), j1.dir, +j1.heading.toFixed(2)], freeMs, maxNet: +maxNet.toFixed(2), maxHeadingQ: +maxHd.toFixed(2), rTaps, gear: j1.gear };
};
await seg('get-in-1', getIn);
const sites = [
  { name: 'tree-35-37x20-22', route: [[33, 6], [37, 8], [37, 16]], hd: 1 },
  { name: 'tree-41.95x24.5', route: [[33, 6], [37, 8], [37, 16], [41.9, 19.9]], hd: 1 },
];
for (const s of sites) {
  for (const [lab, sx] of [['W+A', -1], ['W+D', 1]]) {
    await seg(`${s.name}-route-${lab}`, () => driveTo(s.route, { timeoutMs: 30000 }));
    await seg(`${s.name}-contact-${lab}`, () => contact(s.hd));
    await shot(`${s.name}-contact-${lab}`);
    await seg(`${s.name}-pin-${lab}`, () => pinTest(sx, 4000));
    await shot(`${s.name}-after-${lab}`);
    // back out the way a player would to reset for the next probe: R + straight
    await seg(`${s.name}-reset-${lab}`, async () => { await gear('R'); await hold(0, -1, 1500); await gear('D'); });
  }
}
R.frames = await p.evaluate(() => window.__R); save();
const vid = p.video(); await ctx.close(); await b.close(); fs.renameSync(await vid.path(), `${OUT}/video/pinprobe-${vp}.webm`);
console.log('DONE', vp, 'ce', R.ce.length);
