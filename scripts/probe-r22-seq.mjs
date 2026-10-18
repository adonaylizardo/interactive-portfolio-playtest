#!/usr/bin/env node
/** r22: one session per width, visitor-order doors, real taps only. No driveEnter. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r22');
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
      zeroMphT: j.zeroMphT ?? 0,
      noProgressT: j.noProgressT ?? 0,
      sitWhy: j.sitWhy ?? '',
      interior: r.interior,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      zoom: window.__playtestQa.getZoom?.() ?? 0,
    };
  });
}

async function vanClient(page) {
  return page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    const e = window.__playtestQa.jacEntities();
    return window.__playtestQa.worldToClient(e.worldX, e.worldY);
  });
}

async function boardVan(page, cdp, touch) {
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) {
    const s = await snap(page);
    if (s.driving) return { ok: true, ms: Date.now() - t0, tries: i };
    if (s.interior) {
      await tapSalir(page, cdp, touch);
      await wait(200);
    }
    await page.evaluate(() => {
      window.__playtestQa.dismissBuildingPanel?.();
      window.__playtestQa.focusJac?.();
      window.__playtestQa.setZoom?.(0.45);
    });
    await wait(160);
    const pt = await vanClient(page);
    const pick = pt
      ? await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), pt)
      : null;
    if (pt && pick?.jac) await realTap(page, cdp, pt.x, pt.y, touch);
    for (let w = 0; w < 80; w++) {
      const now = await snap(page);
      if (now.driving) return { ok: true, ms: Date.now() - t0, tries: i + 1 };
      await wait(80);
    }
  }
  return { ok: false, ms: Date.now() - t0, tries: 10 };
}

async function tapSalir(page, cdp, touch) {
  const btn = page.locator('.building-panel [data-exit], [data-exit]').first();
  for (let i = 0; i < 4; i++) {
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      if (touch) await btn.tap({ timeout: 2000, force: true }).catch(() => {});
      else await btn.click({ timeout: 2000, force: true }).catch(() => {});
    } else {
      const box = await page.evaluate(() => {
        const el = document.querySelector('.building-panel [data-exit], [data-exit]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (box) await realTap(page, cdp, box.x, box.y, touch);
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      const s = await snap(page);
      if (!s.interior && !s.panel) return true;
      await wait(80);
    }
  }
  return false;
}

function onScreen(pt, view) {
  return !!pt && !!view && pt.x >= 8 && pt.y >= 8 && pt.x <= view.width - 8 && pt.y <= view.height - 8;
}

function clampTap(pt, view) {
  if (!pt || !view) return null;
  return {
    x: Math.min(view.width - 12, Math.max(12, pt.x)),
    y: Math.min(view.height - 12, Math.max(12, pt.y)),
  };
}

async function tapDoor(page, cdp, name, touch) {
  const view = page.viewportSize();
  let pt = null;
  let pick = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((n) => window.__playtestQa.frameDoorForQa?.(n), name);
    await wait(220);
    const raw = await page.evaluate((n) => window.__playtestQa.doorScreenPoint?.(n), name);
    pt = clampTap(raw, view);
    pick = pt ? await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), pt) : null;
    if (pt && pick?.door === name && !pick.jac) break;
    if (pt && pick?.door === name) break;
  }
  if (!pt) return { tapped: false, accepted: false, pt, pick };
  await realTap(page, cdp, pt.x, pt.y, touch);
  await wait(160);
  const hit = await page.evaluate((n) => {
    const j = window.__playtestQa.jac();
    const r = window.__playtestQa.inputReady();
    const buildings = window.__playtestQa.getEnterableBuildings();
    const b = buildings.find((o) => o.name === n);
    const g = j.driveGoal;
    if (!b?.door) return { pending: !!r.pendingDrive, near: false, driving: j.driving };
    const own = g ? Math.hypot(g.x - b.door.x, g.y - b.door.y) : Infinity;
    return { pending: !!r.pendingDrive, near: own < 12, goal: g, driving: j.driving };
  }, name);
  return { tapped: true, accepted: !!(hit.pending || hit.near), pt, pick, hit };
}

async function waitEntered(page, timeout = 40000) {
  const t0 = Date.now();
  let last = null;
  let zeroGoalMs = 0;
  let lastZeroAt = 0;
  while (Date.now() - t0 < timeout) {
    last = await snap(page);
    const away = Math.hypot((last.cx ?? 0) - 25.5, (last.cy ?? 0) - 17) > 2.2;
    if ((last.interior || last.panel) && away && !last.driving) {
      return { ...last, ok: true, ms: Date.now() - t0, stall: zeroGoalMs };
    }
    if (last.goal && (last.mph ?? 0) === 0) {
      if (!lastZeroAt) lastZeroAt = Date.now();
      zeroGoalMs = Date.now() - lastZeroAt;
    } else {
      lastZeroAt = 0;
      zeroGoalMs = 0;
    }
    if (zeroGoalMs > 8000 && last.goal) {
      return { ...last, ok: false, ms: Date.now() - t0, why: `zero-mph-stall ${zeroGoalMs}ms at ${last.cx?.toFixed(1)},${last.cy?.toFixed(1)}`, stall: zeroGoalMs };
    }
    await wait(60);
  }
  return { ...last, ok: false, ms: Date.now() - t0, why: 'timeout', stall: zeroGoalMs };
}

async function waitParked(page, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await snap(page);
    if (!s.interior && !s.driving) return true;
    await wait(80);
  }
  return false;
}

async function panTest(page, cdp, touch) {
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.setZoom?.(0.12);
    window.__playtestQa.jacSetGear?.('D');
  });
  await wait(200);
  const before = await snap(page);
  const view = page.viewportSize();
  const cx = Math.round(view.width * 0.35);
  const cy = Math.round(view.height * 0.45);
  const moved = [];
  for (let i = 0; i < 10; i++) {
    const pre = await snap(page);
    const x0 = cx + (i % 2 === 0 ? 0 : 20);
    const y0 = cy + (i % 3) * 8;
    const x1 = x0 + (i % 2 === 0 ? -170 : 170);
    const y1 = y0 + 40;
    await realDrag(page, cdp, x0, y0, x1, y1, 200, touch);
    await wait(80);
    const post = await snap(page);
    const d = Math.hypot((post.cx ?? 0) - (pre.cx ?? 0), (post.cy ?? 0) - (pre.cy ?? 0));
    const goalChanged =
      JSON.stringify(pre.goal) !== JSON.stringify(post.goal) &&
      !(pre.goal && post.goal && Math.hypot(pre.goal.x - post.goal.x, pre.goal.y - post.goal.y) < 0.2);
    moved.push({
      i: i + 1,
      d: Number(d.toFixed(2)),
      goalChanged,
      from: { x: pre.cx, y: pre.cy },
      to: { x: post.cx, y: post.cy },
      goal: post.goal,
    });
  }
  const after = await snap(page);
  const vanMoved = moved.filter((m) => m.d > 0.8);
  const goalSets = moved.filter((m) => m.goalChanged);
  return {
    ok: vanMoved.length === 0 && goalSets.length === 0,
    zoom: after.zoom,
    start: { x: before.cx, y: before.cy, goal: before.goal },
    vanMoved,
    goalSets,
    drags: moved,
  };
}

async function pickVanAtFarZoom(page) {
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.setZoom?.(0.12);
  });
  await wait(160);
  return page.evaluate(() => {
    const e = window.__playtestQa.jacEntities();
    const pt = window.__playtestQa.worldToClient(e.worldX, e.worldY);
    const pick = window.__playtestQa.pickAt(pt.x, pt.y);
    return { pt, pick, zoom: window.__playtestQa.getZoom?.() };
  });
}

async function runWidth(spec) {
  const tag = spec.tag;
  const row = { doors: [], pan: null, pick: null, ok: true };
  const browser = await launchBrowser(chromium, { args: GL_ARGS, headless: true });
  const ctx = await browser.newContext({
    viewport: spec.size,
    deviceScaleFactor: 1,
    isMobile: spec.touch,
    hasTouch: spec.touch,
  });
  await hideWebdriver(ctx);
  const page = await ctx.newPage();
  page.on('crash', () => {
    page._dead = true;
    report.errors.push(`${tag}: page crash`);
  });
  const cdp = await ctx.newCDPSession(page);
  try {
    await boot(page);
    if (!report.hash) {
      report.hash = await page.evaluate(() => {
        const s = [...document.scripts].map((x) => x.src).find((u) => /index-.*\.js/.test(u));
        return (s && s.match(/index-[^/]+\.js/)?.[0]) || '';
      });
    }
    await page.evaluate(() => {
      window.__playtestQa.setLayout?.('map');
      window.__playtestQa.setNpcs?.(false);
      window.__playtestQa.setLang?.('es');
    });
    const boarded = await boardVan(page, cdp, spec.touch);
    if (!boarded.ok) {
      row.ok = false;
      report.errors.push(`${tag}: could not board with a real tap`);
      row.board = boarded;
      return row;
    }
    row.pick = await pickVanAtFarZoom(page);
    if (!row.pick?.pick?.jac) {
      row.ok = false;
      report.errors.push(`${tag}: pickAt van at zoom 0.12 missed jac (${JSON.stringify(row.pick?.pick)})`);
    }
    row.pan = await panTest(page, cdp, spec.touch);
    if (!row.pan.ok) {
      row.ok = false;
      report.errors.push(
        `${tag}: pan drove van or set goal (${JSON.stringify({ moved: row.pan.vanMoved, goals: row.pan.goalSets })})`,
      );
    }
    await page.evaluate(() => {
      window.__playtestQa.focusJac?.();
      window.__playtestQa.setZoom?.(0.4);
      window.__playtestQa.jacSetGear?.('D');
    });
    await wait(200);

    for (const name of DOORS) {
      const start = await snap(page);
      if (!start.driving) {
        const reboard = await boardVan(page, cdp, spec.touch);
        if (!reboard.ok) {
          row.doors.push({ name, ok: false, why: 'reboard-failed', ...start });
          row.ok = false;
          report.errors.push(`${tag}:${name}: reboard failed`);
          break;
        }
      }
      const tap = await tapDoor(page, cdp, name, spec.touch);
      if (!tap.accepted) {
        row.doors.push({ name, ok: false, why: 'tap-miss-no-fallback', tap, ...(await snap(page)) });
        row.ok = false;
        report.errors.push(`${tag}:${name}: real tap did not accept (no driveEnter)`);
        break;
      }
      const entered = await waitEntered(page);
      const shot = path.join(OUT, `${tag}-${name}.png`);
      await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
      row.doors.push({
        name,
        ok: entered.ok,
        ms: entered.ms,
        cx: entered.cx,
        cy: entered.cy,
        stall: entered.stall ?? 0,
        why: entered.why ?? '',
        panel: entered.panel,
        interior: entered.interior,
      });
      if (!entered.ok) {
        row.ok = false;
        report.errors.push(`${tag}:${name}: ${entered.why ?? 'enter-failed'} @ ${entered.cx?.toFixed?.(1)},${entered.cy?.toFixed?.(1)}`);
        break;
      }
      await wait(350);
      const left = await tapSalir(page, cdp, spec.touch);
      if (!left) {
        row.ok = false;
        report.errors.push(`${tag}:${name}: Salir tap did not leave`);
        break;
      }
      await waitParked(page);
    }
  } catch (err) {
    row.ok = false;
    report.errors.push(`${tag}: ${err?.message ?? err}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return row;
}

function table(widths) {
  const lines = [
    `# r22 sequential real-tap`,
    '',
    `base: ${report.base}`,
    `hash: ${report.hash}`,
    `probed: ${report.startedAt} → ${new Date().toISOString()}`,
    '',
  ];
  for (const spec of WIDTHS) {
    const w = widths[spec.tag];
    if (!w) continue;
    lines.push(`## ${spec.tag} ${w.ok ? 'OK' : 'FAIL'}`);
    lines.push('');
    lines.push('| door | ok | ms | pos | stall | extra |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const d of w.doors) {
      lines.push(
        `| ${d.name} | ${d.ok ? 'OK' : 'FAIL'} | ${d.ms ?? ''} | ${(d.cx ?? 0).toFixed?.(2) ?? d.cx},${(d.cy ?? 0).toFixed?.(2) ?? d.cy} | ${d.stall ?? 0} | ${d.why || d.panel || ''} |`,
      );
    }
    if (w.pan) {
      lines.push('');
      lines.push(
        `pan 10-drag @ zoom ${w.pan.zoom}: ${w.pan.ok ? 'OK' : 'FAIL'} moved=${w.pan.vanMoved.length} goalSets=${w.pan.goalSets.length}`,
      );
    }
    if (w.pick) {
      lines.push(`pickAt van @ 0.12: jac=${w.pick.pick?.jac} door=${w.pick.pick?.door} building=${w.pick.pick?.building}`);
    }
    lines.push('');
  }
  if (report.errors.length) {
    lines.push('## errors');
    lines.push('');
    for (const e of report.errors) lines.push(`- ${e}`);
  }
  return lines.join('\n');
}

const only = process.env.QA_WIDTH;
const specs = only ? WIDTHS.filter((w) => w.tag.includes(only)) : WIDTHS;
for (const spec of specs) {
  log(`\n=== ${spec.tag} sequential ===`);
  report.widths[spec.tag] = await runWidth(spec);
  log(JSON.stringify({ tag: spec.tag, ok: report.widths[spec.tag].ok, doors: report.widths[spec.tag].doors.map((d) => [d.name, d.ok, d.ms]) }, null, 2));
}

report.finishedAt = new Date().toISOString();
const md = table(report.widths);
fs.writeFileSync(path.join(OUT, 'tables.md'), md);
fs.writeFileSync(path.join(OUT, 'r22-seq.json'), JSON.stringify(report, null, 2));
log('\n' + md);
if (report.errors.length) process.exitCode = 1;
