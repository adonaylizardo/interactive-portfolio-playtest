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
    const pt = clampTap(await vanClient(page), page.viewportSize());
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
  let pt = null;
  let pick = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await page.evaluate((n) => window.__playtestQa.doorScreenPoint?.(n), name);
    pt = clampTap(raw, view);
    pick = pt ? await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), pt) : null;
    if (pt && pick?.door === name && !pick.jac) break;
    if (pt && pick?.door === name) {
      pt = { x: pt.x, y: Math.max(12, pt.y - 18) };
      pick = await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), pt);
      if (pick?.door === name) break;
    }
    await wait(160);
  }
  if (!pt) return { tapped: false, accepted: false, pt, pick };
  await realTap(page, cdp, pt.x, pt.y, touch);
  await wait(160);
  const after = await snap(page);
  return {
    tapped: true,
    accepted: after.accepts > accepts0 || after.preview || after.interior || after.panel,
    pt,
    pick,
    accepts: after.accepts,
  };
}

async function waitEntered(page, timeout = 80000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await snap(page);
    const away = Math.hypot((last.cx ?? 0) - 25.5, (last.cy ?? 0) - 17) > 2.2;
    if (away && !last.driving && (last.interior || last.panel || last.preview)) {
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
  if (how === 'escape') {
    await page.keyboard.press('Escape');
  } else if (how === 'backdrop') {
    const pt = await backdropPoint(page);
    await realTap(page, cdp, pt.x, pt.y, touch);
  } else {
    const box = await visibleClose(page, how);
    if (box) await realTap(page, cdp, box.x, box.y, touch);
    else if (how === 'salir') await page.keyboard.press('Escape');
    else {
      const fb = await visibleClose(page);
      if (fb) await realTap(page, cdp, fb.x, fb.y, touch);
    }
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    const s = await snap(page);
    if (!s.interior && !s.panel && !s.preview) return { ok: true, how, ms: Date.now() - t0 };
    await wait(60);
  }
  return { ok: false, how, ...(await snap(page)) };
}

async function reboardWithin(page, cdp, touch, budgetMs = 3000) {
  const t0 = Date.now();
  const ready = await snap(page);
  const pt = clampTap(await vanClient(page), page.viewportSize());
  const pick = pt ? await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), pt) : null;
  if (pt) await realTap(page, cdp, pt.x, pt.y, touch);
  while (Date.now() - t0 < budgetMs) {
    const s = await snap(page);
    if (s.driving) return { ok: true, ms: Date.now() - t0, pick, ready, toast: s.toast };
    await wait(50);
  }
  const last = await snap(page);
  return { ok: !!last.driving, ms: Date.now() - t0, pick, ready, last, toast: last.toast };
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
  await pinchToward(page, cdp, 0.18, spec.touch);
  const tap = await tapDoor(page, cdp, name, spec.touch);
  if (!tap.accepted && !(await snap(page)).preview) {
    return { ok: false, why: 'tap-miss', tap };
  }
  const entered = await waitEntered(page);
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
      await closePreview(page, cdp, spec.touch, 'x');
      const re = await reboardWithin(page, cdp, spec.touch, 8000);
      if (!re.ok) {
        row.ok = false;
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
          await closePreview(page, cdp, spec.touch, 'x');
          const re = await reboardWithin(page, cdp, spec.touch, 8000);
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
        const re = await reboardWithin(page, cdp, spec.touch, 8000);
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
