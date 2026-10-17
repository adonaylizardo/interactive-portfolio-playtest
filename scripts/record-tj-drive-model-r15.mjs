#!/usr/bin/env node
/** CDP proof r15: first-tap get-in, i-button info, EN/ES copy, hide Adonay
 *  pill while driving, drive-to-door then walk in. No r11–r13 regressions. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r15');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4222/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const CLUSTERS = [
  { id: 'spawn', cx: 25, cy: 17, dir: 'se' },
  { id: 'acacia', cx: 17, cy: 16, dir: 'nw' },
  { id: 'cuji-4', cx: 17, cy: 17, dir: 'se' },
  { id: 'cardon-park', cx: 14, cy: 32, dir: 'se' },
];

async function waitUntil(page, fn, timeout = 12000, step = 80) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await wait(step);
  }
  return last;
}

async function sitByVan(page) {
  await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const cx = Math.round(j.cx);
    const cy = Math.round(j.cy);
    for (let d = 1; d <= 6; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const x = cx + dx;
          const y = cy + dy;
          const ch = walk[y]?.[x];
          if (!ch || ch === '#' || ch === 'x') continue;
          window.__playtestQa.setCharacterTile(x, y);
          return;
        }
      }
    }
  });
}

async function parkVan(page) {
  await page.evaluate(() => {
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
    window.__playtestQa.jacStick?.(null);
    window.__playtestQa.focusJac?.();
  });
  await wait(80);
}

async function ensureDriving(page, tag) {
  if (await page.evaluate(() => window.__playtestQa.jac()?.driving)) return;
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
  });
  await sitByVan(page);
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
  });
  const boarded = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    16000,
  );
  if (!boarded) throw new Error(`${tag}: never boarded`);
}

async function fuzzCluster(page, cluster, n, seed) {
  return page.evaluate(
    ({ cluster, n, seed }) => {
      const qa = window.__playtestQa;
      let s = seed;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
      qa.jacSet?.({ cx: cluster.cx, cy: cluster.cy, dir: cluster.dir, mode: 'drive' });
      qa.jacSetGear?.('D');
      let overlapFrames = 0;
      let stuckOver = 0;
      let maxStuck = 0;
      const samples = [];
      for (let i = 0; i < n; i++) {
        qa.jacSet?.({ cx: cluster.cx, cy: cluster.cy, dir: cluster.dir, mode: 'drive' });
        const segs = 3 + Math.floor(rnd() * 3);
        let stuck = 0;
        let prev = { cx: cluster.cx, cy: cluster.cy };
        for (let g = 0; g < segs; g++) {
          const dx = rnd() * 2 - 1;
          const dy = rnd() * 2 - 1;
          const mag = Math.hypot(dx, dy) || 1;
          const hold = 0.35 + rnd() * 0.7;
          const steps = Math.max(4, Math.round(hold / 0.05));
          for (let t = 0; t < steps; t++) {
            const st = qa.jacDriveStep?.(0.05, dx / mag, dy / mag);
            if (!st) continue;
            if (st.overlap) {
              overlapFrames += 1;
              samples.push({ i, g, t, ...st });
            }
            const moved = Math.hypot(st.cx - prev.cx, st.cy - prev.cy);
            if (moved < 0.03 && st.overlap) stuck += 50;
            else stuck = 0;
            if (stuck > maxStuck) maxStuck = stuck;
            if (stuck > 2000) stuckOver += 1;
            prev = { cx: st.cx, cy: st.cy };
          }
        }
      }
      const end = qa.jac();
      return {
        cluster: cluster.id,
        n,
        overlapFrames,
        stuckOver,
        maxStuck,
        end: { cx: end?.cx, cy: end?.cy, dir: end?.dir },
        hits: samples.slice(0, 8),
      };
    },
    { cluster, n, seed },
  );
}

async function productFlow(page, tag, phone) {
  const notes = {};
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.setLang?.('en');
  });
  await parkVan(page);
  await sitByVan(page);
  await wait(200);

  const parked = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const labels = window.__playtestQa.nameLabels();
    const menu = document.querySelector('.jac-menu');
    const info = document.querySelector('.name-label__info');
    return {
      mode: j?.mode,
      driving: j?.driving,
      menuHidden: !menu || menu.hidden || menu.closest('[hidden]'),
      infoBtn: !!(info && !info.hidden && info.closest('.name-label') && !info.closest('.name-label').hidden),
      labels,
      check: document.querySelector('.checklist__active-title')?.textContent ?? '',
      label: document.querySelector('.checklist__label')?.textContent ?? '',
    };
  });
  notes.parked = parked;
  if (parked.driving) throw new Error(`${tag}: expected parked before first tap`);
  if (!parked.infoBtn) throw new Error(`${tag}: missing i button on JAC T9 pill`);
  if (parked.label !== 'Getting started') throw new Error(`${tag}: EN label is '${parked.label}'`);
  if (/Camina por el mundo|Camina con las teclas/.test(parked.check)) {
    throw new Error(`${tag}: EN checklist leaked Spanish '${parked.check}'`);
  }
  await page.screenshot({ path: path.join(OUT, `${tag}-parked-i.png`) });

  await page.evaluate(() => document.querySelector('.name-label__info')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  const infoOpen = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mode === 'info')) ? true : null),
    4000,
  );
  if (!infoOpen) throw new Error(`${tag}: i button did not open info`);
  notes.infoFromI = true;
  await page.screenshot({ path: path.join(OUT, `${tag}-info-i.png`) });
  await page.evaluate(() => window.__playtestQa.jacClose?.());
  await wait(120);

  await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    let placed = false;
    for (let y = 0; y < walk.length && !placed; y++) {
      for (let x = 0; x < (walk[y]?.length ?? 0); x++) {
        const ch = walk[y][x];
        if (!ch || ch === '#' || ch === 'x') continue;
        if (Math.hypot(x - j.cx, y - j.cy) < 8) continue;
        window.__playtestQa.setCharacterTile(x, y);
        placed = true;
        break;
      }
    }
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
  });
  const farMode = await page.evaluate(() => window.__playtestQa.jac()?.mode);
  if (farMode === 'menu') throw new Error(`${tag}: far tap opened the old menu`);
  const farBoarded = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    20000,
  );
  if (!farBoarded) throw new Error(`${tag}: far tap did not walk-and-get-in`);
  notes.farTap = { mode: farMode, driving: true };
  await page.evaluate(() => window.__playtestQa.jacGetOut());
  await waitUntil(page, async () => ((await page.evaluate(() => !window.__playtestQa.jac()?.driving)) ? true : null), 8000);

  await sitByVan(page);
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
  });
  const boarded = await waitUntil(
    page,
    async () => {
      const j = await page.evaluate(() => window.__playtestQa.jac());
      return j?.driving ? j : null;
    },
    16000,
  );
  if (!boarded) throw new Error(`${tag}: first tap did not get in`);
  if (boarded.mode === 'menu') throw new Error(`${tag}: first tap opened the old menu`);
  const drivingUi = await page.evaluate(() => {
    const labels = window.__playtestQa.nameLabels();
    const menu = document.querySelector('.jac-menu');
    const hint = document.querySelector('.jac-hint');
    const stick = window.__playtestQa.joystick?.();
    return {
      labels,
      adonay: labels.find((l) => l.id === 'adonay'),
      jac: labels.find((l) => l.id === 'jac'),
      menuHidden: !menu || menu.hidden || !!menu.closest('[hidden]'),
      hint: hint?.textContent ?? '',
      hintHidden: !hint || hint.hidden,
      stick,
      rearOn: document.body.classList.contains('jac-rearcam'),
      gear: window.__playtestQa.jac()?.gear,
    };
  });
  notes.drivingUi = drivingUi;
  if (drivingUi.adonay?.visible) throw new Error(`${tag}: Adonay pill visible while driving`);
  if (drivingUi.jac?.name === 'Adonay') throw new Error(`${tag}: jac pill renamed to Adonay while driving`);
  if (drivingUi.jac && drivingUi.jac.visible && drivingUi.jac.name !== 'JAC T9') {
    throw new Error(`${tag}: jac pill is '${drivingUi.jac.name}'`);
  }
  if (drivingUi.jac?.info) throw new Error(`${tag}: i button showing while driving`);
  if (!drivingUi.menuHidden) throw new Error(`${tag}: menu visible after first-tap get-in`);
  if (!phone && drivingUi.hint && drivingUi.hint !== 'Use arrows or WASD') {
    throw new Error(`${tag}: EN hint leaked '${drivingUi.hint}'`);
  }
  if (phone && drivingUi.stick && drivingUi.stick.shown === false) {
    throw new Error(`${tag}: joystick missing while driving on phone`);
  }
  await page.screenshot({ path: path.join(OUT, `${tag}-driving-pills.png`) });

  const vanTap = await page.evaluate(() => {
    const e = window.__playtestQa.jacEntities?.();
    const c = e ? window.__playtestQa.worldToClient?.(e.worldX, e.worldY) : null;
    if (c) window.__playtestQa.tapScreen?.(c.x, c.y);
    const toast = document.getElementById('playtest-toast');
    const j = window.__playtestQa.jac();
    return {
      driving: j?.driving,
      mode: j?.mode,
      toast: toast?.classList.contains('playtest-toast--visible') ? toast.textContent : '',
      cx: j?.cx,
    };
  });
  notes.vanTapWhileDriving = vanTap;
  if (!vanTap.driving) throw new Error(`${tag}: tapping van while driving dropped drive mode`);
  if (vanTap.mode === 'menu') throw new Error(`${tag}: tapping van while driving opened menu`);

  await page.evaluate(() => window.__playtestQa.jacGetOut());
  const out = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving === false)) ? true : null),
    8000,
  );
  if (!out) throw new Error(`${tag}: get-out failed`);
  await wait(200);
  const restored = await page.evaluate(() => window.__playtestQa.nameLabels().find((l) => l.id === 'adonay'));
  notes.restoredAdonay = restored;
  if (!restored?.visible) throw new Error(`${tag}: Adonay pill not restored after get-out`);
  await page.screenshot({ path: path.join(OUT, `${tag}-getout-pill.png`) });

  await sitByVan(page);
  await page.keyboard.press('e');
  const eIn = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    8000,
  );
  if (!eIn) throw new Error(`${tag}: E near van did not get in`);
  await page.evaluate(() => window.__playtestQa.jacGetOut());
  await waitUntil(page, async () => ((await page.evaluate(() => !window.__playtestQa.jac()?.driving)) ? true : null), 8000);
  await sitByVan(page);
  await page.keyboard.press('Enter');
  const enterIn = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    8000,
  );
  if (!enterIn) throw new Error(`${tag}: Enter near van did not get in`);
  notes.keys = { e: true, enter: true };

  await page.evaluate(() => window.__playtestQa.setLang?.('es'));
  await wait(80);
  const esCopy = await page.evaluate(() => ({
    label: document.querySelector('.checklist__label')?.textContent ?? '',
    title: document.querySelector('.checklist__active-title')?.textContent ?? '',
    hint: document.querySelector('.jac-hint')?.textContent ?? '',
    toastKey: window.__playtestQa.t?.('toast.unreachable'),
    getOut: window.__playtestQa.t?.('toast.getOutToEnter'),
  }));
  notes.esCopy = esCopy;
  if (esCopy.label !== 'Primeros pasos') throw new Error(`${tag}: ES label '${esCopy.label}'`);
  if (esCopy.hint !== 'Usa flechas o WASD') throw new Error(`${tag}: ES hint '${esCopy.hint}'`);
  if (esCopy.toastKey !== 'No se puede llegar') throw new Error(`${tag}: ES toast dict '${esCopy.toastKey}'`);
  if (esCopy.getOut !== 'Bájate para entrar') throw new Error(`${tag}: ES get-out toast '${esCopy.getOut}'`);

  await page.evaluate(() => window.__playtestQa.setLang?.('en'));
  await wait(80);
  const enCopy = await page.evaluate(() => ({
    label: document.querySelector('.checklist__label')?.textContent ?? '',
    hint: document.querySelector('.jac-hint')?.textContent ?? '',
    toastKey: window.__playtestQa.t?.('toast.unreachable'),
    getOut: window.__playtestQa.t?.('toast.getOutToEnter'),
    walk: window.__playtestQa.t?.('check.walkAround'),
  }));
  notes.enCopy = enCopy;
  if (enCopy.label !== 'Getting started') throw new Error(`${tag}: EN label after toggle '${enCopy.label}'`);
  if (enCopy.hint !== 'Use arrows or WASD') throw new Error(`${tag}: EN hint '${enCopy.hint}'`);
  if (enCopy.toastKey !== "Can't get there") throw new Error(`${tag}: EN toast dict '${enCopy.toastKey}'`);
  if (enCopy.getOut !== 'Get out to enter') throw new Error(`${tag}: EN get-out toast '${enCopy.getOut}'`);
  if (enCopy.walk !== 'Walk around the world') throw new Error(`${tag}: EN walk '${enCopy.walk}'`);
  await page.screenshot({ path: path.join(OUT, `${tag}-i18n-en.png`) });

  await page.evaluate(() => {
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
    window.__playtestQa.focusJac?.();
  });
  await wait(120);
  const driveEnter = await page.evaluate(() => {
    const buildings = window.__playtestQa.getEnterableBuildings?.() ?? [];
    const target = buildings.find((b) => b.door && (b.name === 'mentoria' || b.name === 'estudio' || b.name === 'pg')) ?? buildings[0];
    const ok = target ? window.__playtestQa.walkToBuilding(target.name) : false;
    return { ok, name: target?.name, door: target?.door, goal: window.__playtestQa.jac()?.driveGoal };
  });
  notes.driveEnterStart = driveEnter;
  if (!driveEnter.ok) throw new Error(`${tag}: walkToBuilding while driving failed`);
  const enteredOrToasted = await waitUntil(
    page,
    async () => {
      return page.evaluate(() => {
        const interior = window.__playtestQa.isInInterior?.();
        const toast = document.getElementById('playtest-toast');
        const toastOn = toast?.classList.contains('playtest-toast--visible');
        const driving = window.__playtestQa.jac()?.driving;
        const goal = window.__playtestQa.jac()?.driveGoal;
        if (interior) return { kind: 'interior', id: window.__playtestQa.getInteriorId?.() };
        if (toastOn && /Get out to enter|Bájate para entrar/.test(toast.textContent ?? '')) {
          return { kind: 'toast', text: toast.textContent };
        }
        if (!driving && !goal) return { kind: 'parked' };
        if (goal) return null;
        return null;
      });
    },
    24000,
    120,
  );
  notes.driveEnterEnd = enteredOrToasted;
  if (!enteredOrToasted) throw new Error(`${tag}: drive-to-door never parked, entered, or toasted`);
  if (enteredOrToasted.kind === 'parked') {
    const walked = await waitUntil(
      page,
      async () => ((await page.evaluate(() => window.__playtestQa.isInInterior?.())) ? true : null),
      12000,
    );
    notes.driveEnterWalkIn = !!walked;
  }
  await page.screenshot({ path: path.join(OUT, `${tag}-drive-enter.png`) });
  if (await page.evaluate(() => window.__playtestQa.isInInterior?.())) {
    await page.evaluate(() => window.__playtestQa.leaveInteriorNow?.());
    await wait(200);
  }

  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  notes.consoleErrors = logs.filter((t) => !/Failed to load resource|404/.test(t));

  const fuzz = [];
  const per = phone ? 25 : 25;
  for (let c = 0; c < CLUSTERS.length; c++) {
    const r = await fuzzCluster(page, CLUSTERS[c], per, 47 + c * 99);
    if (r.overlapFrames > 0) throw new Error(`${tag} fuzz ${r.cluster}: ${r.overlapFrames} overlap frames`);
    if (r.stuckOver > 0 || r.maxStuck > 2000) {
      throw new Error(`${tag} fuzz ${r.cluster}: stuck ${r.maxStuck}ms (${r.stuckOver})`);
    }
    fuzz.push(r);
  }
  notes.fuzz = { n: fuzz.reduce((n, f) => n + f.n, 0), fuzz };

  if (!phone) {
    await page.evaluate(() => {
      window.__playtestQa.jacSetGear?.('R');
      const el = document.getElementById('playtest-toast') ?? document.createElement('div');
      el.id = 'playtest-toast';
      el.className = 'playtest-toast playtest-toast--visible';
      el.textContent = window.__playtestQa.t?.('toast.unreachable') ?? "Can't get there";
      document.getElementById('ui-root')?.appendChild(el);
      const hint = document.querySelector('.jac-hint');
      if (hint) {
        hint.hidden = false;
        hint.textContent = window.__playtestQa.t?.('jac.hint') ?? '';
      }
    });
    await wait(80);
    const chrome = await page.evaluate(() => {
      const toast = document.getElementById('playtest-toast')?.getBoundingClientRect();
      const pip = document.querySelector('.jac-rear')?.getBoundingClientRect();
      const card = document.querySelector('.checklist')?.getBoundingClientRect();
      const hint = document.querySelector('.jac-hint')?.getBoundingClientRect();
      const dock = document.querySelector('.jac-dock')?.getBoundingClientRect();
      const hit = (a, b) =>
        !!a &&
        !!b &&
        a.width > 2 &&
        b.width > 2 &&
        !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
      return {
        pip: hit(toast, pip),
        card: hit(toast, card),
        hint: hit(toast, hint),
        dock: hit(toast, dock),
        toastText: document.getElementById('playtest-toast')?.textContent ?? '',
        hintText: document.querySelector('.jac-hint')?.textContent ?? '',
      };
    });
    notes.toastChrome = chrome;
    await page.screenshot({ path: path.join(OUT, `${tag}-toast-chrome.png`) });
    if (chrome.pip) throw new Error(`${tag}: toast overlaps PiP`);
    if (chrome.card) throw new Error(`${tag}: toast overlaps Getting started`);
    if (chrome.hint) throw new Error(`${tag}: toast overlaps WASD hint`);
    if (chrome.dock) throw new Error(`${tag}: toast overlaps dock`);
    if (chrome.toastText !== "Can't get there") throw new Error(`${tag}: toast text '${chrome.toastText}'`);
  }

  return notes;
}

async function run(tag, options, phone) {
  const notes = [];
  const errors = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    ...options,
    recordVideo: { dir: path.join(OUT, `${tag}-clips`), size: options.viewport },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const bundle = await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
    );
    notes.push({ bundle });
    const flow = await productFlow(page, tag, phone);
    notes.push(flow);
    const realErrors = errors.filter((t) => !/Failed to load resource|404|net::ERR/.test(t));
    if (realErrors.length) throw new Error(`${tag}: console errors ${realErrors.join(' | ')}`);
    await ctx.close();
    const video = page.video();
    if (video) {
      const dest = path.join(OUT, `${tag}-walkthrough.webm`);
      await video.saveAs(dest);
      notes.push({ video: dest });
    }
    return { tag, notes };
  } catch (err) {
    notes.push({ error: String(err) });
    fs.writeFileSync(path.join(OUT, `${tag}-fail.json`), JSON.stringify(notes, null, 2));
    await page.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

const only = process.env.R15_ONLY ?? '';
const results = [];
if (only !== 'desktop') {
  results.push(
    await run(
      'phone-390',
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      true,
    ),
  );
}
if (only !== 'phone') {
  results.push(await run('desktop-1280', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, false));
}
fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('record-tj-drive-model-r15: ok', OUT);
