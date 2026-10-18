#!/usr/bin/env node
/**
 * r24 live gates: real CDP touch (390 / 844×390) and real mouse (1280).
 * Read-only hooks only — no frameDoorForQa / driveEnter / jacSet / setLayout / jacGetIn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r24');
const BASE =
  process.env.QA_BASE_URL ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const DOORS = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];
const DOOR_XY = {
  estudio: { x: 31, y: 36 },
  volaris: { x: 39, y: 36 },
  bain: { x: 39, y: 26 },
  mentoria: { x: 32, y: 26 },
  finoa: { x: 24, y: 24 },
  pg: { x: 24, y: 31 },
  sambil: { x: 47, y: 16 },
  catedral: { x: 14, y: 17 },
  flor: { x: 46, y: 46 },
};

function panelMatches(s, name) {
  const panel = String(s?.panel ?? '').toLowerCase();
  const key = String(name ?? '').toLowerCase();
  if (!key) return !!(s?.preview || s?.interior || s?.panel);
  if (panel.includes(key)) return true;
  if (key === 'pg' && (panel.includes('procter') || panel.includes('gamble'))) return true;
  return false;
}

function nearDoor(s, name, max = 8) {
  const d = DOOR_XY[name];
  if (!d || !s) return false;
  const van = Math.hypot((s.cx ?? 0) - d.x, (s.cy ?? 0) - d.y);
  const ch = Math.hypot((s.char?.x ?? 0) - d.x, (s.char?.y ?? 0) - d.y);
  return van <= max || ch <= max;
}
const WIDTHS = [
  { tag: 'phone-390', size: { width: 390, height: 844 }, touch: true },
  { tag: 'land-844', size: { width: 844, height: 390 }, touch: true },
  { tag: 'desk-1280', size: { width: 1280, height: 800 }, touch: false },
];
const GL_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-gpu-rasterization',
  '--use-angle=swiftshader',
  '--max-active-webgl-contexts=1',
  '--force-device-scale-factor=1',
];

const report = {
  base: BASE,
  hash: '',
  startedAt: new Date().toISOString(),
  widths: {},
  errors: [],
};

function bootUrl() {
  return /[?&]npcs=/.test(BASE) ? BASE : `${BASE}${BASE.includes('?') ? '&' : '?'}npcs=0`;
}

async function hideWebdriver(ctx) {
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
  });
}

async function cdpTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({
      x: p.x,
      y: p.y,
      radiusX: 8,
      radiusY: 8,
      force: 1,
      id: p.id ?? i + 1,
    })),
  });
}

async function realTap(page, cdp, x, y, touch) {
  const view = page.viewportSize();
  if (!view || x < 4 || y < 4 || x > view.width - 4 || y > view.height - 4) return false;
  if (touch) {
    await cdpTouch(cdp, 'touchStart', [{ x, y, id: 7 }]);
    await wait(40);
    await cdpTouch(cdp, 'touchEnd', []);
  } else {
    await page.mouse.click(x, y);
  }
  await wait(50);
  return true;
}

async function realDrag(page, cdp, x0, y0, x1, y1, ms, touch) {
  const steps = 8;
  if (touch) {
    await cdpTouch(cdp, 'touchStart', [{ x: x0, y: y0, id: 3 }]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await cdpTouch(cdp, 'touchMove', [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, id: 3 }]);
      await wait(Math.max(8, Math.round(ms / steps)));
    }
    await cdpTouch(cdp, 'touchEnd', []);
  } else {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps });
    await wait(ms);
    await page.mouse.up();
  }
  await wait(40);
}

function tapSafe(view) {
  return {
    x0: 28,
    y0: Math.min(88, Math.round(view.height * 0.18)),
    x1: view.width - 28,
    y1: view.height - Math.min(96, Math.round(view.height * 0.22)),
  };
}

function clampToSafe(pt, view) {
  const s = tapSafe(view);
  return {
    x: Math.min(s.x1, Math.max(s.x0, pt.x)),
    y: Math.min(s.y1, Math.max(s.y0, pt.y)),
  };
}

async function hitAt(page, x, y) {
  return page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y);
    const canvas = document.getElementById('game-canvas');
    const pick = window.__playtestQa.pickAt(p.x, p.y);
    return {
      tag: el?.tagName ?? '',
      id: el?.id ?? '',
      cls: typeof el?.className === 'string' ? el.className.slice(0, 80) : '',
      canvas: !!(el === canvas || el?.id === 'game-canvas' || el?.closest?.('#game-canvas')),
      pick,
    };
  }, { x, y });
}

async function findCanvasDoorTap(page, name, raw) {
  const view = page.viewportSize();
  if (!raw || !view) return { pt: null, hit: null };
  const offsets = [
    [0, 0],
    [0, -24],
    [0, -48],
    [0, -72],
    [-24, -24],
    [24, -24],
    [0, 24],
    [-36, 0],
    [36, 0],
  ];
  for (const [dx, dy] of offsets) {
    const pt = clampToSafe({ x: raw.x + dx, y: raw.y + dy }, view);
    const hit = await hitAt(page, pt.x, pt.y);
    if (hit.canvas && hit.pick?.door === name && !hit.pick.jac) return { pt, hit };
  }
  for (const [dx, dy] of offsets) {
    const pt = clampToSafe({ x: raw.x + dx, y: raw.y + dy }, view);
    const hit = await hitAt(page, pt.x, pt.y);
    if (hit.canvas && hit.pick?.door === name) return { pt, hit };
  }
  return { pt: null, hit: await hitAt(page, raw.x, raw.y) };
}

async function boot(page) {
  await page.goto(bootUrl(), { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) return;
    await wait(150);
  }
  throw new Error('qa api missing');
}

async function snap(page) {
  return page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const r = window.__playtestQa.inputReady();
    return {
      driving: j.driving,
      gear: j.gear,
      goal: j.driveGoal,
      mph: j.mph,
      vel: j.vel,
      cx: j.cx,
      cy: j.cy,
      interior: r.interior,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      preview: !!window.__playtestQa.isCasePreview?.(),
      zoom: window.__playtestQa.getZoom?.() ?? 0,
      accepts: window.__playtestQa.pointerDriveAccepts?.() ?? 0,
      char: r.char,
      vanOverlap: !!r.vanOverlap,
      pendingWalk: !!r.pendingWalk,
      walkGoal: r.walkGoal ?? '',
      standable: !!r.standable,
      toast: document.getElementById('playtest-toast')?.textContent ?? '',
      toastOn: !!document.getElementById('playtest-toast')?.classList.contains('playtest-toast--visible'),
    };
  });
}

async function skipOnboarding(page, cdp, touch) {
  const box = await page.evaluate(() => {
    const el = document.querySelector('.checklist__skip');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (box) await realTap(page, cdp, box.x, box.y, touch);
  await wait(200);
}

async function vanClient(page) {
  return page.evaluate(() => {
    const e = window.__playtestQa.jacEntities();
    return window.__playtestQa.worldToClient(e.worldX, e.worldY);
  });
}

function clampTap(pt, view) {
  if (!pt || !view) return null;
  return {
    x: Math.min(view.width - 12, Math.max(12, pt.x)),
    y: Math.min(view.height - 12, Math.max(12, pt.y)),
  };
}

async function pinchToward(page, cdp, target, touch) {
  const view = page.viewportSize();
  if (!view) return;
  const cx = view.width / 2;
  const cy = Math.max(80, view.height * 0.4);
  for (let i = 0; i < 10; i++) {
    const z = (await snap(page)).zoom;
    if (Math.abs(z - target) < 0.03) return z;
    if (touch) {
      const zoomOut = z > target;
      const a0 = zoomOut ? 90 : 36;
      const a1 = zoomOut ? 36 : 90;
      await cdpTouch(cdp, 'touchStart', [
        { x: cx - a0, y: cy, id: 1 },
        { x: cx + a0, y: cy, id: 2 },
      ]);
      await wait(30);
      await cdpTouch(cdp, 'touchMove', [
        { x: cx - a1, y: cy, id: 1 },
        { x: cx + a1, y: cy, id: 2 },
      ]);
      await wait(40);
      await cdpTouch(cdp, 'touchEnd', []);
    } else {
      await page.mouse.move(cx, cy);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, z > target ? 500 : -500);
      await page.keyboard.up('Control');
    }
    await wait(180);
  }
  return (await snap(page)).zoom;
}

async function boardVan(page, cdp, touch) {
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) {
    const s = await snap(page);
    if (s.driving) return { ok: true, ms: Date.now() - t0, tries: i, toast: s.toast };
    if (s.interior || s.preview || s.panel) {
      await closePreview(page, cdp, touch, 'x');
      await wait(200);
    }
    const raw = await vanClient(page);
    const view = page.viewportSize();
    const pt = raw && view ? clampToSafe(raw, view) : clampTap(raw, view);
    if (pt) await realTap(page, cdp, pt.x, pt.y, touch);
    for (let w = 0; w < 100; w++) {
      const now = await snap(page);
      if (now.driving) return { ok: true, ms: Date.now() - t0, tries: i + 1, toast: now.toast };
      await wait(80);
    }
  }
  return { ok: false, ms: Date.now() - t0, tries: 8 };
}

async function tapDoor(page, cdp, name, touch) {
  const view = page.viewportSize();
  const accepts0 = (await snap(page)).accepts;
  const raw = await page.evaluate((n) => window.__playtestQa.doorScreenPoint?.(n), name);
  let found = { pt: null, hit: null };
  if (raw && view) {
    const rawHit = await hitAt(page, raw.x, raw.y);
    const inView = raw.x >= 8 && raw.y >= 8 && raw.x <= view.width - 8 && raw.y <= view.height - 8;
    if (inView && rawHit.canvas && rawHit.pick?.door === name && !rawHit.pick.jac) {
      found = { pt: raw, hit: rawHit };
    }
  }
  if (!found.pt) found = await findCanvasDoorTap(page, name, raw);
  if (!found.pt && raw && view) {
    const toward = clampToSafe(raw, view);
    const towardHit = await hitAt(page, toward.x, toward.y);
    if (towardHit.canvas) {
      log('nudge', name, toward, towardHit.pick);
      await realTap(page, cdp, toward.x, toward.y, touch);
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        const s = await snap(page);
        if (panelMatches(s, name) || nearDoor(s, name, 7)) break;
        if (s.mph < 0.3 && s.goal == null && Date.now() - t0 > 1800) break;
        await wait(120);
      }
      const next = await page.evaluate((n) => window.__playtestQa.doorScreenPoint?.(n), name);
      if (next) {
        const nextHit = await hitAt(page, next.x, next.y);
        if (nextHit.canvas && nextHit.pick?.door === name && !nextHit.pick.jac) {
          found = { pt: next, hit: nextHit };
        }
      }
      if (!found.pt) found = await findCanvasDoorTap(page, name, next);
    }
  }
  const pt = found.pt;
  const pick = found.hit?.pick ?? null;
  if (!pt) return { tapped: false, accepted: false, pt: raw, pick, hit: found.hit };
  const tapped = await realTap(page, cdp, pt.x, pt.y, touch);
  await wait(200);
  const after = await snap(page);
  return {
    tapped,
    accepted: after.accepts > accepts0 || panelMatches(after, name) || !!after.goal,
    pt,
    pick,
    hit: found.hit,
    accepts: after.accepts,
    zoom: after.zoom,
  };
}

async function waitEntered(page, name, timeout = 80000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await snap(page);
    if (!last.driving && panelMatches(last, name) && nearDoor(last, name, 10)) {
      return { ...last, ok: true, ms: Date.now() - t0 };
    }
    await wait(80);
  }
  return { ...last, ok: false, ms: Date.now() - t0, why: 'timeout' };
}

async function visibleClose(page, prefer) {
  const sels =
    prefer === 'salir'
      ? ['.case-preview__salir', '.case-read__salir', '.building-panel__exit']
      : prefer === 'x'
        ? ['.case-preview__x', '.case-read__x', '.building-panel [data-close]']
        : [
            '.case-preview__x',
            '.case-preview__salir',
            '.case-read__x',
            '.case-read__salir',
            '.building-panel__exit',
          ];
  return page.evaluate((list) => {
    for (const s of list) {
      const el = document.querySelector(s);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 8 || r.height < 8) continue;
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) continue;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, sel: s };
    }
    return null;
  }, sels);
}

async function backdropPoint(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('.building-panel__sheet');
    const canvas = document.getElementById('game-canvas');
    const view = { w: window.innerWidth, h: window.innerHeight };
    const sr = sheet?.getBoundingClientRect();
    const candidates = [
      { x: Math.round(view.w * 0.5), y: 86 },
      { x: Math.round(view.w * 0.72), y: 70 },
      { x: 422, y: 86 },
    ];
    for (const p of candidates) {
      if (p.x < 8 || p.y < 8 || p.x > view.w - 8 || p.y > view.h - 8) continue;
      if (sr && p.x >= sr.left && p.x <= sr.right && p.y >= sr.top && p.y <= sr.bottom) continue;
      const el = document.elementFromPoint(p.x, p.y);
      if (el === canvas || el?.closest?.('#game-canvas') || el?.tagName === 'CANVAS') return { ...p, el: 'CANVAS' };
      if (el?.closest?.('[data-backdrop], .building-panel__backdrop')) return { ...p, el: 'BACKDROP' };
    }
    return { x: Math.round(view.w * 0.5), y: 64, el: 'fallback' };
  });
}

async function closePreview(page, cdp, touch, how) {
  const before = await snap(page);
  if (!before.preview && !before.panel && !before.interior) return { ok: true, how: 'already-closed' };
  // Estudio / interiors: × [data-close] is a preview-only no-op. Leave via Salir or Escape.
  const interiorOnly = before.interior && !before.preview;
  const method = interiorOnly && how !== 'escape' ? 'salir' : how;
  if (method === 'escape') {
    await page.keyboard.press('Escape');
  } else if (method === 'backdrop' && !interiorOnly) {
    const pt = await backdropPoint(page);
    await realTap(page, cdp, pt.x, pt.y, touch);
  } else {
    const box = await visibleClose(page, interiorOnly ? 'salir' : method);
    if (box) await realTap(page, cdp, box.x, box.y, touch);
    else await page.keyboard.press('Escape');
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const s = await snap(page);
    if (!s.interior && !s.panel && !s.preview) return { ok: true, how: method, ms: Date.now() - t0 };
    await wait(60);
  }
  return { ok: false, how: method, ...(await snap(page)) };
}

async function reboardWithin(page, cdp, touch, budgetMs = 3000) {
  const t0 = Date.now();
  const ready = await snap(page);
  let pick = null;
  let lastTap = null;
  while (Date.now() - t0 < budgetMs) {
    const now = await snap(page);
    if (now.driving) return { ok: true, ms: Date.now() - t0, pick, ready, toast: now.toast };
    if (now.interior || now.preview || now.panel) {
      await closePreview(page, cdp, touch, now.interior && !now.preview ? 'salir' : 'x');
    }
    const raw = await vanClient(page);
    const view = page.viewportSize();
    const pt = raw && view ? clampToSafe(raw, view) : clampTap(raw, view);
    pick = pt ? (await hitAt(page, pt.x, pt.y)).pick : null;
    if (pt && Date.now() - t0 < budgetMs - 80) {
      lastTap = { pt, pick };
      await realTap(page, cdp, pt.x, pt.y, touch);
    }
    await wait(80);
  }
  const last = await snap(page);
  return { ok: !!last.driving, ms: Date.now() - t0, pick, ready, last, lastTap, toast: last.toast };
}

async function openPage(spec) {
  const browser = await launchBrowser(chromium, { args: GL_ARGS, headless: true });
  const ctx = await browser.newContext({
    viewport: spec.size,
    deviceScaleFactor: 1,
    isMobile: spec.touch,
    hasTouch: spec.touch,
  });
  await hideWebdriver(ctx);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await boot(page);
  if (!report.hash) {
    report.hash = await page.evaluate(() => {
      const s = [...document.scripts].map((x) => x.src).find((u) => /index-.*\.js/.test(u));
      return (s && s.match(/index-[^/]+\.js/)?.[0]) || '';
    });
  }
  await skipOnboarding(page, cdp, spec.touch);
  return { browser, ctx, page, cdp, errors };
}

async function driveToDoor(page, cdp, spec, name) {
  const start = await snap(page);
  if (!start.driving) {
    const boarded = await boardVan(page, cdp, spec.touch);
    if (!boarded.ok) return { ok: false, why: 'reboard-failed', boarded };
  }
  const z = await pinchToward(page, cdp, 0.16, spec.touch);
  let tap = await tapDoor(page, cdp, name, spec.touch);
  log('tap', spec.tag, name, 'z', z, tap.accepted, tap.pick, tap.pt, tap.hit?.canvas, tap.hit?.tag);
  if (!tap.accepted && !panelMatches(await snap(page), name)) {
    await wait(240);
    tap = await tapDoor(page, cdp, name, spec.touch);
    log('tap-retry', spec.tag, name, tap.accepted, tap.pick, tap.pt, tap.hit?.canvas, tap.hit?.tag);
  }
  if (!tap.accepted && !panelMatches(await snap(page), name) && !(await snap(page)).goal) {
    return { ok: false, why: 'tap-miss', tap };
  }
  const entered = await waitEntered(page, name);
  if (!entered.ok && nearDoor(entered, name, 8) && !entered.driving) {
    const again = await tapDoor(page, cdp, name, spec.touch);
    log('enter-retap', spec.tag, name, again.accepted, again.pick, again.pt);
    const second = await waitEntered(page, name, 20000);
    if (second.ok) {
      log('enter', spec.tag, name, true, Date.now() - (Date.now() - entered.ms), second.cx, second.cy);
      return { ok: true, entered: { ...second, ms: entered.ms + second.ms }, tap: again };
    }
  }
  log('enter', spec.tag, name, entered.ok, entered.ms, entered.cx, entered.cy, entered.panel, entered.why);
  return { ok: entered.ok, entered, tap };
}

async function closeReboardBain(page, cdp, spec, how) {
  const closed = await closePreview(page, cdp, spec.touch, how);
  if (!closed.ok) return { ok: false, stage: 'close', closed };
  const afterClose = await snap(page);
  const reboard = await reboardWithin(page, cdp, spec.touch, 3000);
  if (!reboard.ok) return { ok: false, stage: 'reboard', closed, reboard, afterClose };
  await pinchToward(page, cdp, 0.18, spec.touch);
  const bain = await driveToDoor(page, cdp, spec, 'bain');
  if (bain.ok) await closePreview(page, cdp, spec.touch, 'x');
  return { ok: bain.ok, closed, reboard, afterClose, bain, how };
}

async function runApproach(spec, approach) {
  const { browser, page, cdp, errors } = await openPage(spec);
  const row = { approach, closes: [], errors, ok: true };
  try {
    const boarded = await boardVan(page, cdp, spec.touch);
    if (!boarded.ok) {
      row.ok = false;
      row.why = 'board-failed';
      report.errors.push(`${spec.tag}:${approach}: board failed`);
      return row;
    }
    row.board = boarded;
    if (approach === 'south') {
      const est = await driveToDoor(page, cdp, spec, 'estudio');
      row.estudio = est;
      if (!est.ok) {
        row.ok = false;
        report.errors.push(`${spec.tag}:${approach}: estudio failed`);
        return row;
      }
      const left = await closePreview(page, cdp, spec.touch, 'salir');
      if (!left.ok) {
        row.ok = false;
        row.why = 'estudio-close-failed';
        report.errors.push(`${spec.tag}:${approach}: estudio close failed`);
        return row;
      }
      const re = await boardVan(page, cdp, spec.touch);
      if (!re.ok) {
        row.ok = false;
        row.reboard = re;
        report.errors.push(`${spec.tag}:${approach}: reboard after estudio failed`);
        return row;
      }
    }
    const first = await driveToDoor(page, cdp, spec, 'volaris');
    row.volaris = first;
    if (!first.ok) {
      row.ok = false;
      report.errors.push(`${spec.tag}:${approach}: volaris failed`);
      return row;
    }
    row.sit = { cx: first.entered.cx, cy: first.entered.cy, char: first.entered.char };
    for (const how of ['x', 'salir', 'escape', 'backdrop']) {
      if (how !== 'x') {
        if (approach === 'south') {
          const est = await driveToDoor(page, cdp, spec, 'estudio');
          if (!est.ok) {
            row.closes.push({ how, ok: false, stage: 'reopen-estudio', est });
            row.ok = false;
            report.errors.push(`${spec.tag}:${approach}:${how}: reopen estudio failed`);
            break;
          }
          const left = await closePreview(page, cdp, spec.touch, 'salir');
          if (!left.ok) {
            row.closes.push({ how, ok: false, stage: 'reopen-estudio-close', left });
            row.ok = false;
            report.errors.push(`${spec.tag}:${approach}:${how}: reopen estudio close failed`);
            break;
          }
          const re = await boardVan(page, cdp, spec.touch);
          if (!re.ok) {
            row.closes.push({ how, ok: false, stage: 'reopen-reboard', re });
            row.ok = false;
            report.errors.push(`${spec.tag}:${approach}:${how}: reopen reboard failed`);
            break;
          }
        }
        const again = await driveToDoor(page, cdp, spec, 'volaris');
        if (!again.ok) {
          row.closes.push({ how, ok: false, stage: 'reopen', again });
          row.ok = false;
          report.errors.push(`${spec.tag}:${approach}:${how}: reopen volaris failed`);
          break;
        }
      }
      const result = await closeReboardBain(page, cdp, spec, how);
      row.closes.push({
        how,
        ok: result.ok,
        closeMs: result.closed?.ms,
        reboardMs: result.reboard?.ms,
        vanOverlap: result.afterClose?.vanOverlap,
        walkGoal: result.afterClose?.walkGoal,
        pendingWalk: result.afterClose?.pendingWalk,
        stage: result.stage,
      });
      if (!result.ok) {
        row.ok = false;
        report.errors.push(`${spec.tag}:${approach}:${how}: ${result.stage || 'bain'} failed`);
        break;
      }
    }
    return row;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runVisitor(spec) {
  const { browser, page, cdp, errors } = await openPage(spec);
  const row = { doors: [], errors, ok: true };
  try {
    const boarded = await boardVan(page, cdp, spec.touch);
    if (!boarded.ok) {
      row.ok = false;
      report.errors.push(`${spec.tag}:visitor: board failed`);
      return row;
    }
    for (const name of DOORS) {
      const start = await snap(page);
      if (!start.driving) {
        const re = await boardVan(page, cdp, spec.touch);
        if (!re.ok) {
          row.doors.push({ name, ok: false, why: 'reboard-failed' });
          row.ok = false;
          report.errors.push(`${spec.tag}:visitor:${name}: reboard failed`);
          break;
        }
      }
      const opened = await driveToDoor(page, cdp, spec, name);
      const shot = path.join(OUT, `${spec.tag}-${name}.png`);
      await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
      row.doors.push({
        name,
        ok: opened.ok,
        ms: opened.entered?.ms,
        cx: opened.entered?.cx,
        cy: opened.entered?.cy,
        preview: opened.entered?.preview,
        why: opened.why ?? opened.entered?.why,
      });
      if (!opened.ok) {
        row.ok = false;
        report.errors.push(`${spec.tag}:visitor:${name}: ${opened.why || 'enter-failed'}`);
        break;
      }
      await closePreview(page, cdp, spec.touch, 'x');
    }
    return row;
  } finally {
    await browser.close().catch(() => {});
  }
}

const smokeOnly = process.argv.includes('--smoke');

async function main() {
  log('r24 gates', BASE);
  const widths = smokeOnly ? [WIDTHS[0]] : WIDTHS;
  for (const spec of widths) {
    log('width', spec.tag);
    const north = await runApproach(spec, 'north');
    const south = smokeOnly ? { skipped: true, ok: true } : await runApproach(spec, 'south');
    const visitor =
      smokeOnly || spec.tag === 'desk-1280' ? { skipped: true, ok: true } : await runVisitor(spec);
    report.widths[spec.tag] = { north, south, visitor, ok: north.ok && south.ok && visitor.ok };
    log(
      spec.tag,
      'north',
      north.ok,
      'south',
      south.ok,
      'visitor',
      visitor.ok,
      'sit',
      north.sit,
    );
  }
  report.finishedAt = new Date().toISOString();
  report.ok = Object.values(report.widths).every((w) => w.ok) && report.errors.length === 0;
  fs.writeFileSync(path.join(OUT, 'r24-gates.json'), JSON.stringify(report, null, 2));
  const lines = [
    `# r24 gates`,
    ``,
    `base: ${report.base}`,
    `hash: ${report.hash}`,
    `ok: ${report.ok}`,
    ``,
    `Read-only hooks only. Real CDP touch at 390 / 844×390, real mouse at 1280.`,
    `No frameDoorForQa / driveEnter / jacSet / setLayout / jacGetIn.`,
    ``,
  ];
  for (const [tag, w] of Object.entries(report.widths)) {
    lines.push(`## ${tag}`);
    lines.push(`north sit ${JSON.stringify(w.north.sit ?? {})}`);
    for (const c of w.north.closes ?? []) {
      lines.push(
        `- north ${c.how}: ${c.ok ? 'OK' : 'FAIL'} close ${c.closeMs ?? '—'}ms reboard ${c.reboardMs ?? '—'}ms vanOverlap=${c.vanOverlap} walkGoal=${c.walkGoal || '∅'}`,
      );
    }
    if (!w.south.skipped) {
      lines.push(`south sit ${JSON.stringify(w.south.sit ?? {})}`);
      for (const c of w.south.closes ?? []) {
        lines.push(
          `- south ${c.how}: ${c.ok ? 'OK' : 'FAIL'} close ${c.closeMs ?? '—'}ms reboard ${c.reboardMs ?? '—'}ms`,
        );
      }
    }
    if (!w.visitor.skipped) {
      lines.push(
        `visitor: ${(w.visitor.doors ?? []).map((d) => `${d.name}${d.ok ? '' : ' FAIL'}`).join(' → ') || '—'}`,
      );
    }
    lines.push('');
  }
  if (report.errors.length) {
    lines.push('## errors');
    for (const e of report.errors) lines.push(`- ${e}`);
  }
  fs.writeFileSync(path.join(OUT, 'tables.md'), lines.join('\n'));
  log(lines.join('\n'));
  if (!report.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
