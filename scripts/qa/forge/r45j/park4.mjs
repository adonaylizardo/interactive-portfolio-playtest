// r45h tap-to-park harness (fixed): fresh page per trial, retrying get-in, zoom-out until the door/tile is on screen, null-safe.
// usage: node park4.mjs <vp 1440|1280|375|390> <url> <out> [trials csv]
// r45k QA3: 1280 (1280x800) and 390 (iPhone 390x844 DPR3 touch) added; doors are brought on screen by zoom-out until the
// point is not covered by the HUD (elementFromPoint = canvas). Drag-pan is not possible while driving (camera follows the truck).
// r45k QA3 ruling (Sentinel): every trial gets a status PASS / FAIL / INCONCLUSO. A freeze (rAF gap ≥ FREEZE_MS, or
// wall time past the budget) or a stale end reading (fresh snapshot ≠ last rAF sample, or rAF not ticking) makes the
// trial INCONCLUSO, never PASS. Arrival trials are retried up to 3 times, each in a fresh browser context. Exit code:
// 0 all PASS, 1 any FAIL, 2 otherwise (INCONCLUSO).
// r45k QA1 ruling: the (22,18) gate is `toastGate` (pointerup -> toast text via MutationObserver <=500 ms); opacity time is info only.
import fs from 'node:fs';
import { chromium } from 'playwright';
const vp = process.argv[2], BASE = process.argv[3], OUT = process.argv[4]; const VPS = { 1440: { viewport: { width: 1440, height: 900 } }, 1280: { viewport: { width: 1280, height: 800 } }, 375: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } };
if (!VPS[vp]) throw new Error('vp must be one of ' + Object.keys(VPS));
const phone = !!VPS[vp].hasTouch;
const only = process.argv[5] ? process.argv[5].split(',') : null;
const ctxOpt = VPS[vp];
const FREEZE_MS = 2000, STALE_T = 0.5, STALE_MS = 2000, MAX_ATTEMPTS = 3;
const W = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of ['logs', 'shots', 'video']) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const R = { vp, trials: [] }; const save = () => fs.writeFileSync(`${OUT}/logs/park4-${vp}.json`, JSON.stringify(R));
const A = { estudio: [31, 36], volaris: [39, 36], bain: [39, 26], mentoria: [32, 26], finoa: [24, 24], pg: [24, 31], sambil: [47, 16], catedral: [14, 17], teresa: [34, 14], biblioteca: [6, 30] };
async function trial(label, kind, arg, maxMs, attempt = 1) {
  const ctx = await b.newContext(ctxOpt); const p = await ctx.newPage(); const ce = [];
  p.on('console', (m) => { if (m.type() === 'error') ce.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => ce.push(String(e).slice(0, 200)));
  const tap = (x, y) => (phone ? p.touchscreen.tap(Math.round(x), Math.round(y)) : p.mouse.click(Math.round(x), Math.round(y)));
  const rectOf = (sel) => p.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && !e.closest('[hidden]'); }); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  const jac = () => p.evaluate(() => window.__playtestQa.jac());
  const shot = (n) => p.screenshot({ path: `${OUT}/shots/${vp}-p4-${label}-${n}.png` }).catch(() => {});
  const truckXY = () => p.evaluate(() => { const e = window.__playtestQa.jacEntities(); const c = document.getElementById('game-canvas').getBoundingClientRect(); return [c.left + e.sx, c.top + e.sy - 20]; });
  const out = { label, kind, arg, attempt };
  try {
    await p.goto(BASE + '?qa=1&focus=jac'); await p.waitForSelector('[data-boot-start]', { state: 'visible', timeout: 90000 }); await W(1500);
    const bs = await rectOf('[data-boot-start]'); await tap(bs.x, bs.y); await W(2500);
    let tries = 0; for (; tries < 5; tries++) { if ((await jac()).driving) break; const inBtn = await rectOf('[data-jac="in"]'); if (inBtn) await tap(inBtn.x, inBtn.y); else { const t = await truckXY(); await tap(t[0], t[1]); } await W(1800); }
    await p.waitForFunction(() => window.__playtestQa.jac()?.driving, null, { timeout: 8000 }).catch(() => {});
    out.seated = (await jac()).driving; out.getInTries = tries; if (!out.seated) { await shot('notseated'); throw new Error('not seated'); }
    await W(800);
    await p.evaluate(() => { window.__P = []; const f = () => { const q = window.__playtestQa; const j = q.jac(); const tst = document.getElementById('playtest-toast'); const tOn = tst && +getComputedStyle(tst).opacity > 0.1 && tst.getClientRects().length;
      const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden');
      const card = vis('.place-card, .building-panel'); const dock = vis('.jac-dock') || vis('.jac-bar'); let ov = 0; if (card && dock) { const a = card.getBoundingClientRect(), c = dock.getBoundingClientRect(); ov = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)); }
      const sh = vis('.building-panel__sheet, .place-card'); let ov2 = 0; if (sh && dock) { const a = sh.getBoundingClientRect(), c = dock.getBoundingClientRect(); ov2 = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)); }
      window.__P.push([Math.round(performance.now()), +j.cx.toFixed(3), +j.cy.toFixed(3), j.dir, +j.vel.toFixed(2), j.mode, j.pathN ?? 0, +j.heading.toFixed(3), j.driving ? 1 : 0, tOn ? tst.textContent.trim().slice(0, 50) : null, card ? 1 : 0, Math.round(ov), q.jacFootprintBlocked() ? 1 : 0, Math.round(ov2)]); requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const hudTop = () => p.evaluate(() => Math.min(innerHeight, ...[...document.querySelectorAll('.jac-dock, .jac-bar, .joystick, .place-card, .building-panel')].filter((e) => e.getClientRects().length && !e.closest('[hidden]')).map((e) => e.getBoundingClientRect().top)));
    // QA3: a point counts as tappable when it is inside the viewport margins and the topmost element there is the map
    // canvas (no HUD, stick, dock or card over it). While driving the camera follows the truck, so a drag cannot pan;
    // doors are brought on screen by zooming out (up to 14 wheel steps) instead.
    const onScreen = async (pt) => !!pt && Number.isFinite(pt.x) && pt.x > 15 && pt.x < ctxOpt.viewport.width - 15 && pt.y > 70 && pt.y < ctxOpt.viewport.height - 15 &&
      (await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const c = document.getElementById('game-canvas'); return !!e && !!c && (e === c || c.contains(e)); }, [pt.x, pt.y]));
    const tileScreen = (tx, ty) => p.evaluate(([tx, ty, A]) => { const q = window.__playtestQa; const tw = (x, y) => ({ x: (x - y) * 64, y: (x + y) * 32 });
      const pts = Object.entries(A).map(([n, t]) => ({ s: q.doorScreenPoint(n), w: tw(t[0], t[1]) })).filter((o) => o.s && Number.isFinite(o.s.x)); if (pts.length < 2) return null;
      const mw = { x: 0, y: 0 }, ms = { x: 0, y: 0 }; pts.forEach((o) => { mw.x += o.w.x / pts.length; mw.y += o.w.y / pts.length; ms.x += o.s.x / pts.length; ms.y += o.s.y / pts.length; });
      let num = 0, den = 0; pts.forEach((o) => { num += (o.w.x - mw.x) * (o.s.x - ms.x) + (o.w.y - mw.y) * (o.s.y - ms.y); den += (o.w.x - mw.x) ** 2 + (o.w.y - mw.y) ** 2; });
      const z = num / den; const c = { x: ms.x - z * mw.x, y: ms.y - z * mw.y }; const w = tw(tx + 0.5, ty + 0.5); return { x: c.x + z * w.x, y: c.y + z * w.y, z }; }, [tx, ty, A]);
    const VW = ctxOpt.viewport.width, VH = ctxOpt.viewport.height;
    const zoomOut = async () => { await p.mouse.move(Math.round(VW / 2), Math.round(VH * 0.38)); await p.mouse.wheel(0, 400); await W(900); };
    const target = async () => (kind === 'door' ? p.evaluate((n) => window.__playtestQa.doorScreenPoint(n), arg) : tileScreen(arg[0], arg[1]));
    let pt = await target(), zooms = 0; while (!(await onScreen(pt)) && zooms < 14) { await zoomOut(); zooms++; pt = await target(); }
    out.zooms = zooms; out.pt = pt; if (!(await onScreen(pt))) { await shot('offscreen'); throw new Error('target off-screen after zoom ' + JSON.stringify(pt)); }
    const j0 = await jac(); out.pre = [+j0.cx.toFixed(2), +j0.cy.toFixed(2), j0.dir];
    // r45k QA1 ruling (park4 toast timing): t_up = first pointerup after arming (window capture listener); t_toast = first
    // MutationObserver callback that touches #playtest-toast while it has text. The opacity/rAF time stays info only.
    await p.evaluate(() => { const T = (window.__T = { up: null, toast: null, text: null, preText: document.getElementById('playtest-toast')?.textContent.trim() || '' });
      window.addEventListener('pointerup', () => { if (T.up == null) T.up = performance.now(); }, { capture: true });
      const mo = new MutationObserver((recs) => { if (T.toast != null) return; /* armed just before the tap: the product may set the text on pointerdown, before pointerup (delta <= 0) */ const el = document.getElementById('playtest-toast'); const tx = el?.textContent.trim();
        if (!el || !tx) return; if (!recs.some((r) => el === r.target || el.contains(r.target) || [...r.addedNodes].some((n) => n === el || n.contains?.(el)))) return; T.toast = performance.now(); T.text = tx; });
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); });
    const t0 = await p.evaluate(() => performance.now()); await tap(pt.x, pt.y); const w0 = Date.now();
    let j, idleSince = null; await W(600); let mid = false;
    for (;;) { j = await jac(); const el = Date.now() - w0; if (!mid && el > 3000) { await shot('3s'); mid = true; }
      const idle = (j.pathN ?? 0) === 0 && Math.abs(j.vel) < 0.05; idleSince = idle ? (idleSince ?? Date.now()) : null;
      if (el > maxMs) { out.exit = 'budget'; break; } if (idleSince && Date.now() - idleSince > 1200) { out.exit = 'idle'; break; } if (!j.driving) { out.exit = 'notDriving'; break; } await W(250); }
    out.ms = Date.now() - w0; await W(500); await shot('end');
    out.dest = await p.evaluate(() => window.__playtestQa.lastDriveTap());
    const P = (await p.evaluate(() => window.__P)).filter((r) => r[0] >= t0);
    let sheetOv = 0, spins = [], trav = 0, toasts = new Map(), cardOv = 0, card = 0, fb = 0, fbMoving = 0, maxd = 0, fbFirst = null, revs = 0, prevSign = 0;
    for (let k = 1; k < P.length; k++) { const a = P[k - 1], c = P[k]; const d = Math.hypot(c[1] - a[1], c[2] - a[2]); trav += d; maxd = Math.max(maxd, d);
      if (c[3] !== a[3]) { if (trav < 0.3) spins.push([a[3], c[3], +trav.toFixed(2), c[1], c[2]]); trav = 0; }
      if (c[9] && !toasts.has(c[9])) toasts.set(c[9], c[0] - t0); if (c[10]) card = 1; cardOv = Math.max(cardOv, c[11]); sheetOv = Math.max(sheetOv, c[13] || 0);
      if (c[12] && c[8]) { fb++; if (Math.abs(c[4]) > 0.05) fbMoving++; fbFirst ??= [c[1], c[2], c[3], c[4], c[0] - t0]; }
      const sg = Math.sign(c[4]); if (sg && prevSign && sg !== prevSign) revs++; if (sg) prevSign = sg; }
    // livelock: longest window with path active and < 0.5 tile net displacement
    let worst = 0; for (let i = 0, k = 0; i < P.length; i++) { while (k < P.length && Math.hypot(P[k][1] - P[i][1], P[k][2] - P[i][2]) < 0.5 && P[k][6] > 0) k++; worst = Math.max(worst, (P[Math.max(i, k - 1)][0] - P[i][0])); }
    // QA3: arrival is judged on a FRESH snapshot, cross-checked against the last rAF sample (stale reading ⇒ INCONCLUSO).
    const F = await p.evaluate(() => ({ j: window.__playtestQa.jac(), now: performance.now(), last: window.__P[window.__P.length - 1] ?? null }));
    out.info_loopEnd = [+j.cx.toFixed(2), +j.cy.toFixed(2), j.dir, j.pathN]; j = F.j;
    const lastGapMs = F.last ? Math.round(F.now - F.last[0]) : null, lastDiffT = F.last ? +Math.hypot(F.last[1] - j.cx, F.last[2] - j.cy).toFixed(3) : null;
    out.stale = { lastSampleAgeMs: lastGapMs, freshVsLastSampleT: lastDiffT, stale: !F.last || lastGapMs > STALE_MS || lastDiffT > STALE_T };
    const dest = out.dest; out.end = [+j.cx.toFixed(2), +j.cy.toFixed(2), j.dir, j.pathN, j.driving, +j.heading.toFixed(2)];
    out.arrived = !!dest && Math.hypot(j.cx - dest.x, j.cy - dest.y) < 1.5 && (j.pathN ?? 0) === 0;
    out.endDistToDest = dest ? +Math.hypot(j.cx - dest.x, j.cy - dest.y).toFixed(2) : null;
    let path = 0; for (let k = 1; k < P.length; k++) path += Math.hypot(P[k][1] - P[k - 1][1], P[k][2] - P[k - 1][2]);
    const T = await p.evaluate(() => window.__T); let rafMax = 0; for (let k = 1; k < P.length; k++) rafMax = Math.max(rafMax, P[k][0] - P[k - 1][0]);
    const visMs = toasts.size ? [...toasts.values()][0] : null; const moved = Math.max(0, ...P.map((r) => Math.hypot(r[1] - j0.cx, r[2] - j0.cy)));
    out.toastTiming = { cdpToUpMs: T.up != null ? Math.round(T.up - t0) : null, upToToastMs: T.up != null && T.toast != null ? +(T.toast - T.up).toFixed(1) : null, info_toastBeforeUp: T.up != null && T.toast != null && T.toast < T.up, text: T.text, preText: T.preText,
      info_visibleMsFromDispatch: visMs != null ? Math.round(visMs) : null, info_rafMaxMs: rafMax, info_rafStallFlag: rafMax > 250, movedTiles: +moved.toFixed(3) };
    if (label.startsWith('unreach')) { const tt = out.toastTiming;
      out.toastGate = { pass: tt.upToToastMs != null && tt.upToToastMs <= 500 && tt.text === 'No se puede llegar' && moved < 0.05 && visMs != null, rule: 'pointerup->toast text <=500 ms, text "No se puede llegar", truck moved <0.05 t, toast visible (opacity>0.1) at some point' }; }
    out.freeze = { rafMaxMs: rafMax, overBudgetMs: Math.max(0, out.ms - maxMs), frozen: rafMax >= FREEZE_MS || out.ms > maxMs + 5000 };
    Object.assign(out, { pathLen: +path.toFixed(2), spins, livelockMs: worst, velReversals: revs, toasts: [...toasts.entries()], card, cardDockOverlapPx2: cardOv, sheetDockOverlapPx2: sheetOv, fbFrames: fb, fbMovingFrames: fbMoving, fbFirst, maxFrameDisp: +maxd.toFixed(3), frames: P.length, track: P.filter((_, i) => i % 6 === 0).map((r) => [r[1], r[2], r[3], r[6], r[12]]), ce });
  } catch (e) { out.err = String(e).slice(0, 300); out.ce = ce; }
  out.status = statusOf(out);
  console.log(JSON.stringify({ ...out, track: undefined })); R.trials.push(out); save(); await ctx.close();
  return out;
}
/** QA3: harness trouble (error, freeze, stale reading) ⇒ INCONCLUSO; otherwise the trial's own criterion. */
function statusOf(o) {
  if (o.err || o.freeze?.frozen || o.stale?.stale) return 'INCONCLUSO';
  if (o.toastGate) return o.toastGate.pass ? 'PASS' : 'FAIL';
  const ok = o.arrived && (o.kind !== 'door' || o.card === 1) && o.cardDockOverlapPx2 === 0 && (o.fbMovingFrames ?? 0) === 0;
  return ok ? 'PASS' : 'FAIL';
}
const plan = [];
for (let i = 1; i <= 5; i++) plan.push([`t23-7-${i}`, 'tile', [23, 7], 20000]);
plan.push(['unreach-22-18', 'tile', [22, 18], 12000]);
plan.push(['bain', 'door', 'bain', 120000]);
plan.push(['volaris', 'door', 'volaris', 120000]);
const final = [];
for (const t of plan) {
  if (only && !only.some((o) => t[0].startsWith(o))) continue;
  // QA3: up to 3 attempts (fresh context each) while the reading is INCONCLUSO; a clean FAIL is not retried.
  let o; for (let a = 1; a <= MAX_ATTEMPTS; a++) { o = await trial(...t, a); if (o.status !== 'INCONCLUSO') break; }
  final.push([t[0], o.status, o.attempt]);
}
R.final = final; save();
await b.close();
for (const [l, st, a] of final) console.log(`${l}: ${st} (attempt ${a})`);
const anyFail = final.some((f) => f[1] === 'FAIL'), allPass = final.every((f) => f[1] === 'PASS');
console.log('PARK4: ' + (allPass ? 'PASS' : anyFail ? 'FAIL' : 'INCONCLUSO'));
console.log('DONE');
process.exit(allPass ? 0 : anyFail ? 1 : 2);
