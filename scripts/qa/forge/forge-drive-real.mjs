// Real-input truck driving test. Input = real keyboard / mouse / CDP touch only.
// State is READ-ONLY observation via window.__playtestQa (requires ?qa=1); it never drives.
// usage: node drive-real.mjs <1440|375> [url] [outdir]
import fs from 'node:fs';
import { chromium } from 'playwright';
const vp = process.argv[2] || '1440';
const BASE = process.argv[3] || 'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-integracion/';
const OUT = process.argv[4] || new URL('.', import.meta.url).pathname;
for (const d of ['logs', 'shots', 'video']) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
const phone = vp !== '1440';
const ctxOpt = phone
  ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...ctxOpt, recordVideo: { dir: `${OUT}/video`, size: ctxOpt.viewport } });
const p = await ctx.newPage();
const R = { vp, url: BASE, ce: [], segs: [], shots: [] };
p.on('console', (m) => { if (m.type() === 'error') R.ce.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => R.ce.push('pageerror ' + String(e).slice(0, 200)));
const save = () => fs.writeFileSync(`${OUT}/logs/drive-real-${vp}.json`, JSON.stringify(R));
const shot = async (n) => { const f = `${OUT}/shots/${vp}-${n}.png`; await p.screenshot({ path: f, timeout: 60000 }).catch(() => {}); R.shots.push(f); return f; };
const cdp = await ctx.newCDPSession(p);
const tap = async (x, y) => (phone ? p.touchscreen.tap(Math.round(x), Math.round(y)) : p.mouse.click(Math.round(x), Math.round(y)));
const rectOf = (sel) => p.evaluate((s) => {
  const e = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; });
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
}, sel);
const tapSel = async (sel) => { const r = await rectOf(sel); if (!r) return null; await tap(r.x, r.y); return r; };

await p.goto(BASE + '?qa=1&focus=jac', { waitUntil: 'load' });
await p.waitForSelector('[data-boot-start]', { state: 'visible', timeout: 90000 }).catch(() => {});
await W(1500);
await tapSel('[data-boot-start]');
await W(2500);
// read-only recorder: per rAF frame
await p.evaluate(() => {
  window.__R = []; window.__mut = 0; window.__seg = 'boot'; window.__k = new Set(); addEventListener('keydown', (e) => window.__k.add(e.key.toLowerCase()), true); addEventListener('keyup', (e) => window.__k.delete(e.key.toLowerCase()), true);
  const mo = new MutationObserver((ms) => { for (const m of ms) if (m.type === 'childList') window.__mut++; });
  const hook = () => { const d = document.querySelector('.jac-dock__body'); if (d && !d.__obs) { mo.observe(d, { childList: true, subtree: true }); d.__obs = 1; } };
  const f = () => {
    hook();
    const q = window.__playtestQa; let j = null; try { j = q.jac(); } catch {}
    let jq = null; try { jq = q.joystick?.(); } catch {}
    const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length && !e.closest('[hidden]'));
    const rpmEl = vis('[data-rpm]'), mphEl = vis('[data-mph]');
    const nr = vis('.jac-gauge--rpm .jac-gauge__needle'), nm = vis('.jac-gauge--mph .jac-gauge__needle');
    const gearOn = vis('[data-jac="gear"].is-on'); const g0 = vis('[data-jac="gear"]'); if (g0 && !g0.__id) { window.__gid = (window.__gid || 0) + 1; g0.__id = window.__gid; }
    const card = !!vis('.place-card, .building-panel--preview, .building-panel.is-preview');
    if (j && window.__R.length < 60000) window.__R.push([
      Math.round(performance.now()), window.__seg, +j.cx.toFixed(3), +j.cy.toFixed(3), +j.heading.toFixed(4), j.dir,
      +j.vel.toFixed(3), j.gear, +(+j.steering).toFixed(3), j.mode, j.driving ? 1 : 0,
      rpmEl?.textContent ?? null, mphEl?.textContent ?? null, nr?.style.transform ?? null, nm?.style.transform ?? null,
      gearOn?.dataset.val ?? null, window.__mut,
      jq ? (jq.visible ? 1 : 0) : null, jq ? (jq.active ? 1 : 0) : null, jq ? +jq.x.toFixed(2) : null, jq ? +jq.y.toFixed(2) : null,
      card ? 1 : 0, q.jacFootprintBlocked?.() ? 1 : 0, j.pathN ?? 0, g0?.__id ?? null, (window.__k.has('w') || window.__k.has('arrowup') ? -1 : 0) + (window.__k.has('s') || window.__k.has('arrowdown') ? 1 : 0), (window.__k.has('d') || window.__k.has('arrowright') ? 1 : 0) - (window.__k.has('a') || window.__k.has('arrowleft') ? 1 : 0),
    ]);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
const seg = async (name, fn) => {
  await p.evaluate((n) => { window.__seg = n; }, name);
  const t0 = await p.evaluate(() => performance.now());
  let err = null; try { await fn(); } catch (e) { err = String(e).slice(0, 200); }
  const t1 = await p.evaluate(() => performance.now());
  R.segs.push({ name, t0: Math.round(t0), t1: Math.round(t1), err }); save();
};
// get in the normal way: the visible "Súbete" (data-jac="in") button
await seg('get-in', async () => {
  let r = null;
  { // fallback: tap the truck, then the menu's in button
    const t = await p.evaluate(() => { const e = window.__playtestQa.jacEntities(); const c = document.getElementById('game-canvas').getBoundingClientRect(); return [c.left + e.sx, c.top + e.sy - 20]; });
    R.truckClick = t; await tap(t[0], t[1]); await W(1500); r = await tapSel('[data-jac="in"]'); if (!r) { await W(1500); r = await tapSel('[data-jac="in"]'); }
  }
  R.inVia = r ? 'in-button' : 'FAILED';
  await p.waitForFunction(() => window.__playtestQa.jac()?.driving, null, { timeout: 30000 }).catch(() => {});
  await W(1500);
});
await shot('01-driving');

if (!phone) {
  const hold = async (keys, ms) => { for (const k of keys) await p.keyboard.down(k); await W(ms); for (const k of [...keys].reverse()) await p.keyboard.up(k); };
  await seg('W-1500', () => hold(['w'], 1500));
  await seg('coast-1000', () => W(1000));
  await seg('W+A-1500', () => hold(['w', 'a'], 1500));
  await seg('W+D-1500', () => hold(['w', 'd'], 1500));
  await seg('W-then-A-release-mid', async () => { await p.keyboard.down('w'); await W(500); await p.keyboard.down('a'); await W(600); await p.keyboard.up('a'); await W(700); await p.keyboard.up('w'); });
  await seg('arrows-up+right-1500', () => hold(['ArrowUp', 'ArrowRight'], 1500));
  await seg('quick-taps-W-x10', async () => { for (let i = 0; i < 10; i++) { await p.keyboard.down('w'); await W(70); await p.keyboard.up('w'); await W(90); } });
  await seg('S-brake-1000', () => hold(['s'], 1000));
  await seg('A-only-stopped-800', () => hold(['a'], 800));
  await shot('02-after-keys');
  await seg('click-gear-R', async () => { R.gearR = await tapSel('[data-jac="gear"][data-val="R"]'); await W(400); });
  await seg('R+W-1200', () => hold(['w'], 1200));
  await seg('R+W+A-1000', () => hold(['w', 'a'], 1000));
  await seg('R+S-800', () => hold(['s'], 800));
  await seg('click-gear-D', async () => { R.gearD = await tapSel('[data-jac="gear"][data-val="D"]'); await W(400); });
  await seg('W+D-open-1500', () => hold(['w', 'd'], 1500));
  await seg('W+A-open-1500', () => hold(['w', 'a'], 1500));
  await seg('W-then-D-release-mid', async () => { await p.keyboard.down('w'); await W(400); await p.keyboard.down('d'); await W(500); await p.keyboard.up('d'); await W(500); await p.keyboard.up('w'); });
  await seg('arrowUp+ArrowLeft-1200', () => hold(['ArrowUp', 'ArrowLeft'], 1200));
  await seg('S-brake-then-W+D', async () => { await hold(['s'], 600); await hold(['w', 'd'], 1200); });
  await seg('click-gear-D-while-W', async () => { await p.keyboard.down('w'); await W(500); R.gearDmoving = await tapSel('[data-jac="gear"][data-val="N"]'); await W(300); await tapSel('[data-jac="gear"][data-val="D"]'); await W(600); await p.keyboard.up('w'); });
  await seg('long-drive-blocks', async () => {
    const pat = [['w', 2500], ['w+d', 900], ['w', 2000], ['w+a', 900], ['w', 2500], ['w+a', 1100], ['w', 2000], ['w+d', 700], ['w', 2500]];
    for (const [k, ms] of pat) await hold(k.split('+'), ms);
  });
  await shot('03-after-long');
  await seg('into-wall-hold-W-3000', () => hold(['w'], 3000));
  await seg('wall-W+A-2000', () => hold(['w', 'a'], 2000));
  await shot('04-wall');
  await seg('get-out-button', async () => { R.out = await tapSel('[data-jac="out"]'); await W(2500); });
  await seg('get-in-E', async () => { await p.keyboard.press('e'); await W(1500); if (!(await p.evaluate(() => window.__playtestQa.jac().driving))) { await tapSel('[data-jac="in"]'); } await W(1500); });
  await seg('after-reenter-W-1500', () => hold(['w'], 1500));
} else {
  let joy = null, down = false;
  const getJoy = async () => { joy = await rectOf('.joystick'); return joy; };
  const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
  const stick = async (dx, dy, extra = []) => {
    if (!joy) await getJoy(); if (!joy) throw new Error('joystick not visible');
    const r = 28; const pt = tp(joy.x + dx * r, joy.y + dy * r, 1);
    if (!down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x, joy.y, 1), ...extra] }); down = true; await W(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt, ...extra] });
  };
  const release = async () => { if (down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); down = false; } };
  const holdStick = async (dx, dy, ms) => { const n = Math.max(1, Math.round(ms / 60)); for (let i = 0; i < n; i++) { await stick(dx + (i % 2 ? 0.01 : -0.01), dy); await W(60); } };
  await seg('joystick-visible', async () => { R.joy = await getJoy(); });
  await seg('stick-up-full-1500', async () => { await holdStick(0, -1, 1500); await release(); });
  await seg('tap-gear-D-first', async () => { R.gearD0 = await tapSel('[data-jac="gear"][data-val="D"]'); await W(400); });
  await seg('stick-up-right-turn-1800', async () => { await holdStick(0.6, -0.8, 1800); await release(); });
  await seg('stick-circle-at-speed-3s', async () => { await holdStick(0, -1, 500); for (let i = 0; i < 50; i++) { const a = -Math.PI / 2 + Math.sin(i / 8) * 0.9; await stick(Math.cos(a), Math.sin(a)); await W(60); } await release(); });
  await seg('coast-1000', () => W(1000));
  await seg('stick-up-small-0.3-1500', async () => { await holdStick(0, -0.3, 1500); await release(); });
  await seg('stick-up-left-1500', async () => { await holdStick(-0.7, -0.7, 1500); await release(); });
  await seg('stick-up-right-1500', async () => { await holdStick(0.7, -0.7, 1500); await release(); });
  await seg('stick-circle-3s', async () => { for (let i = 0; i < 50; i++) { const a = -Math.PI / 2 + (i / 50) * Math.PI * 2; await stick(Math.cos(a), Math.sin(a)); await W(60); } await release(); });
  await seg('stick-down-brake-800', async () => { await holdStick(0, 1, 800); await release(); });
  await seg('stick-side-only-stopped-800', async () => { await holdStick(1, 0, 800); await release(); });
  await seg('stick-start-off-center', async () => { // finger lands near pad edge, then pushes up
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(joy.x + 20, joy.y + 20, 1)] }); down = true; await W(30);
    for (let i = 0; i < 25; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(joy.x + 20 - i, joy.y + 20 - i * 3, 1)] }); await W(60); }
    await release();
  });
  await seg('stick-drag-outside-pad', async () => { await stick(0, -1); for (let i = 0; i < 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(joy.x - i * 6, joy.y - 28 - i * 6, 1)] }); await W(60); } await release(); });
  await shot('02-after-stick');
  // multi-touch: hold stick up, second finger taps gear R then D
  await seg('multitouch-gear-R-while-holding', async () => {
    await holdStick(0, -1, 600);
    const g = await rectOf('[data-jac="gear"][data-val="R"]'); R.gearR = g;
    if (g) {
      const s = tp(joy.x, joy.y - 28, 1);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [s, tp(g.x, g.y, 2)] }); await W(80);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [s] }); await W(30);
      for (let i = 0; i < 15; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(joy.x, joy.y - 28 + (i % 2), 1)] }); await W(60); }
    }
    await release();
  });
  await seg('R-stick-up-1200', async () => { await holdStick(0, -1, 1200); await release(); });
  await seg('tap-gear-D', async () => { R.gearD = await tapSel('[data-jac="gear"][data-val="D"]'); await W(400); });
  await seg('multitouch-second-finger-lands-first-lifts', async () => { // a 2nd finger on the canvas while steering, then 1st lifts
    await holdStick(0, -1, 500);
    const s = tp(joy.x, joy.y - 28, 1), o = tp(120, 300, 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [s, o] }); await W(60);
    for (let i = 0; i < 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [s, tp(120 + i * 5, 300, 2)] }); await W(60); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [o] }); await W(30);
    for (let i = 0; i < 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(joy.x, joy.y - 28, 1)] }); await W(60); }
    await release();
  });
  await seg('long-drive-blocks', async () => {
    const pat = [[0, -1, 2500], [0.6, -0.8, 900], [0, -1, 2000], [-0.6, -0.8, 900], [0, -1, 2500], [-0.6, -0.8, 1100], [0, -1, 2000]];
    for (const [x, y, ms] of pat) await holdStick(x, y, ms);
    await release();
  });
  await shot('03-after-long');
  await seg('into-wall-up-3000', async () => { await holdStick(0, -1, 3000); await release(); });
  await seg('wall-up-left-2000', async () => { await holdStick(-0.7, -0.7, 2000); await release(); });
  await shot('04-wall');
  await seg('get-out-button', async () => { R.out = await tapSel('[data-jac="out"]'); await W(2500); });
  await seg('get-in-again', async () => { R.in2 = await tapSel('[data-jac="in"]'); await W(3000); joy = null; });
  await seg('after-reenter-up-1500', async () => { await holdStick(0, -1, 1500); await release(); });
}
await shot('05-end');
R.frames = await p.evaluate(() => window.__R);
R.cols = ['t', 'seg', 'cx', 'cy', 'heading', 'dir', 'vel', 'gear', 'steer', 'mode', 'driving', 'rpmTxt', 'mphTxt', 'rpmNeedle', 'mphNeedle', 'gearOn', 'dockMut', 'joyVis', 'joyActive', 'joyX', 'joyY', 'card', 'fb', 'pathN', 'gearElId', 'keyY', 'keyX'];
save();
const vpath = await p.video()?.path();
await ctx.close(); await b.close();
R.video = vpath; save();
// ---- pass/fail gates (future rounds must pass all) ----
const F = R.frames.map((f) => Object.fromEntries(R.cols.map((c, i) => [c, f[i]])));
const inp = (f) => (phone ? { x: f.joyActive ? f.joyX : 0, y: f.joyActive ? f.joyY : 0 } : { x: f.keyX ?? 0, y: f.keyY ?? 0 });
const fails = [];
const DIRA = { se: 0, sw: 1, nw: 2, ne: 3 };
// G1: gas right after the normal get-in (no gear tap) must move the truck, or the HUD must say why
{ const s = R.segs.find((x) => x.name === (phone ? 'stick-up-full-1500' : 'W-1500')); const fs = F.filter((f) => f.t >= s.t0 && f.t <= s.t1);
  const d = fs.length ? Math.hypot(fs.at(-1).cx - fs[0].cx, fs.at(-1).cy - fs[0].cy) : 0; if (d < 1) fails.push({ gate: 'G1 gas after get-in moves', moved: +d.toFixed(2), gear: fs[0]?.gear }); }
// G2: deadlock = gas + steer held >=1.5 s in D/R with zero motion
{ let st = null; for (const f of F) { const i = inp(f); const want = Math.abs(i.y) > 0.5 && Math.abs(i.x) > 0.4 && f.driving && (f.gear === 'D' || f.gear === 'R');
    if (want) { if (!st) st = f; else if (f.t - st.t >= 1500 && Math.hypot(f.cx - st.cx, f.cy - st.cy) < 0.05 && Math.abs(f.heading - st.heading) < 0.01) { fails.push({ gate: 'G2 steer+gas deadlock', seg: f.seg, at: [st.cx, st.cy, st.heading, st.dir] }); st = null; } }
    else st = null; } }
// G3: sprite must match motion (crab angle <= 35 deg while moving >0.5 t/s)
{ let worst = 0, n = 0; for (let k = 1; k < F.length; k++) { const a = F[k - 1], b = F[k]; const m = Math.hypot(b.cx - a.cx, b.cy - a.cy); if (m < 0.05 || Math.abs(b.vel) < 0.5) continue;
    let mv = Math.atan2(b.cy - a.cy, b.cx - a.cx) / (Math.PI / 2); if (b.vel < 0) mv += 2; let d = ((mv - DIRA[b.dir]) % 4 + 6) % 4 - 2; d = Math.abs(d) * 90; if (d > 35) n++; worst = Math.max(worst, d); }
  if (n > 0) fails.push({ gate: 'G3 sprite vs motion <=35deg', frames: n, worstDeg: Math.round(worst) }); }
// G4: desktop dock must not rebuild while driving (gear button identity stable)
if (!phone) { const reb = F.filter((f, k) => k && f.driving && F[k - 1].driving && f.gearElId && F[k - 1].gearElId && f.gearElId !== F[k - 1].gearElId).length; if (reb > 4) fails.push({ gate: 'G4 dock DOM stable while driving', rebuilds: reb }); }
// G5: phone joystick must be active whenever the script holds it (visible + active during stick segments)
if (phone) { const bad = F.filter((f) => /^stick-/.test(f.seg) && f.joyVis === 0).length; if (bad) fails.push({ gate: 'G5 joystick visible while driving', frames: bad }); }
// G6: no console errors
if (R.ce.length) fails.push({ gate: 'G6 console errors', n: R.ce.length });
R.verdict = { pass: fails.length === 0, fails }; save();
console.log('done', vp, 'frames', R.frames.length, 'video', vpath, 'ce', R.ce.length, JSON.stringify(R.verdict));
process.exitCode = fails.length ? 1 : 0;
