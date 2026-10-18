#!/usr/bin/env node
/** r23: one session per width — visitor-order doors, retarget 4×3, 5 ground taps. Real taps only. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r23');
const BASE =
  process.env.QA_BASE_URL ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const DOORS = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];
const GROUND_GOALS = [
  [46, 20],
  [24, 27],
  [37, 26],
  [44, 36],
  [18, 36],
];
const RETARGET_PAIRS = [
  { from: 'sambil', to: 'finoa', delay: 800, want: /finoa/i },
  { from: 'sambil', to: 'mentoria', delay: 800, want: /mentor/i },
  { from: 'flor', to: 'volaris', delay: 1500, want: /volaris|airline/i },
  { from: 'estudio', to: 'pg', delay: 800, want: /p&g|pg/i },
];
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
      zeroMphT: j.zeroMphT ?? 0,
      noProgressT: j.noProgressT ?? 0,
      sitWhy: j.sitWhy ?? '',
      interior: r.interior,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      preview: !!window.__playtestQa.isCasePreview?.(),
      zoom: window.__playtestQa.getZoom?.() ?? 0,
      accepts: window.__playtestQa.pointerDriveAccepts?.() ?? 0,
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
    if (s.interior || s.preview || s.panel) {
      await tapClose(page, cdp, touch);
      await wait(200);
    }
    await page.evaluate(() => {
      window.__playtestQa.dismissBuildingPanel?.();
      window.__playtestQa.focusJac?.();
      window.__playtestQa.setZoom?.(0.45);
    });
    await wait(160);
    const pt = await vanClient(page);
    const pick = pt ? await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), pt) : null;
    if (pt && pick?.jac) await realTap(page, cdp, pt.x, pt.y, touch);
    for (let w = 0; w < 80; w++) {
      const now = await snap(page);
      if (now.driving) return { ok: true, ms: Date.now() - t0, tries: i + 1 };
      await wait(80);
    }
  }
  return { ok: false, ms: Date.now() - t0, tries: 10 };
}

async function visibleClose(page) {
  return page.evaluate(() => {
    const sel = [
      '.case-preview__salir',
      '.case-read__salir',
      '.case-preview__x',
      '.case-read__x',
      '.building-panel__exit',
      '.building-panel [data-exit]',
      '.building-panel [data-close]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 8 || r.height < 8) continue;
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) continue;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, sel: s };
    }
    return null;
  });
}

async function tapClose(page, cdp, touch) {
  for (let i = 0; i < 4; i++) {
    const loc = page.locator('.case-preview__salir, .case-read__salir, .case-preview__x, .case-read__x, .building-panel__exit').first();
    const vis = await loc.isVisible().catch(() => false);
    if (vis) {
      if (touch) await loc.tap({ timeout: 2000 }).catch(() => {});
      else await loc.click({ timeout: 2000 }).catch(() => {});
    }
    const box = vis ? null : await visibleClose(page);
    if (box) await realTap(page, cdp, box.x, box.y, touch);
    const t0 = Date.now();
    while (Date.now() - t0 < 2200) {
      const s = await snap(page);
      if (!s.interior && !s.panel && !s.preview) return { ok: true, how: box?.sel ?? 'already-closed' };
      await wait(80);
    }
  }
  const before = await snap(page);
  if (before.preview || before.panel || before.interior) {
    await page.goBack().catch(() => {});
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      const s = await snap(page);
      if (!s.interior && !s.panel && !s.preview) return { ok: true, how: 'back' };
      await wait(80);
    }
  }
  const last = await snap(page);
  return { ok: !last.interior && !last.panel && !last.preview, how: 'failed', last };
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
  const accepts0 = (await snap(page)).accepts;
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
  const after = await snap(page);
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
  return {
    tapped: true,
    accepted: !!(hit.pending || hit.near || after.accepts > accepts0),
    pt,
    pick,
    hit,
    accepts: after.accepts,
  };
}

async function waitEntered(page, timeout = 50000) {
  const t0 = Date.now();
  let last = null;
  let zeroGoalMs = 0;
  let lastZeroAt = 0;
  while (Date.now() - t0 < timeout) {
    last = await snap(page);
    const away = Math.hypot((last.cx ?? 0) - 25.5, (last.cy ?? 0) - 17) > 2.2;
    if (away && !last.driving && (last.interior || last.panel || last.preview)) {
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
      return {
        ...last,
        ok: false,
        ms: Date.now() - t0,
        why: `zero-mph-stall ${zeroGoalMs}ms at ${last.cx?.toFixed(1)},${last.cy?.toFixed(1)}`,
        stall: zeroGoalMs,
      };
    }
    await wait(60);
  }
  return { ...last, ok: false, ms: Date.now() - t0, why: 'timeout', stall: zeroGoalMs };
}

async function waitArrive(page, gx, gy, timeout = 20000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await snap(page);
    const d = Math.hypot((last.cx ?? 0) - gx, (last.cy ?? 0) - gy);
    if (d <= 1.5 && (last.mph ?? 0) < 2) return { ...last, ok: true, ms: Date.now() - t0, dist: d };
    await wait(60);
  }
  const d = Math.hypot((last?.cx ?? 0) - gx, (last?.cy ?? 0) - gy);
  return { ...last, ok: false, ms: Date.now() - t0, dist: d, why: 'timeout' };
}

async function tapTile(page, cdp, tx, ty, touch) {
  const view = page.viewportSize();
  await page.evaluate(([x, y]) => {
    const wx = (x - y) * 64;
    const wy = (x + y) * 32;
    window.__playtestQa.frameWorld?.(wx, wy, 0.35);
  }, [tx, ty]);
  await wait(180);
  const raw = await page.evaluate(([x, y]) => window.__playtestQa.tileScreenPoint?.(x, y), [tx, ty]);
  const pt = clampTap(raw, view);
  if (!pt) return { tapped: false, accepted: false };
  await realTap(page, cdp, pt.x, pt.y, touch);
  await wait(140);
  const going = await page.evaluate(([x, y]) => {
    const g = window.__playtestQa.jac().driveGoal;
    return !!g && Math.hypot(g.x - x, g.y - y) < 4;
  }, [tx, ty]);
  return { tapped: true, accepted: going, pt };
}

async function waitParked(page, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await snap(page);
    if (!s.interior && !s.preview && !s.driving) return true;
    await wait(80);
  }
  return false;
}

async function runWidth(spec) {
  const tag = spec.tag;
  const row = { doors: [], retarget: [], ground: [], ok: true };
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
        preview: entered.preview,
      });
      if (!entered.ok) {
        row.ok = false;
        report.errors.push(
          `${tag}:${name}: ${entered.why ?? 'enter-failed'} @ ${entered.cx?.toFixed?.(1)},${entered.cy?.toFixed?.(1)}`,
        );
        break;
      }
      await wait(250);
      const left = await tapClose(page, cdp, spec.touch);
      if (!left.ok) {
        row.ok = false;
        report.errors.push(`${tag}:${name}: close (×/Salir/Back) did not leave (${left.how})`);
        break;
      }
      await waitParked(page);
    }

    for (const pair of RETARGET_PAIRS) {
      for (let rep = 1; rep <= 3; rep++) {
        const reboard = await boardVan(page, cdp, spec.touch);
        if (!reboard.ok) {
          row.retarget.push({ pair: `${pair.from}→${pair.to}`, rep, ok: false, why: 'reboard-failed' });
          row.ok = false;
          report.errors.push(`${tag}: retarget ${pair.from}→${pair.to} #${rep} reboard failed`);
          continue;
        }
        const first = await tapDoor(page, cdp, pair.from, spec.touch);
        if (!first.accepted) {
          row.retarget.push({ pair: `${pair.from}→${pair.to}`, rep, ok: false, why: 'from-tap-miss' });
          row.ok = false;
          report.errors.push(`${tag}: retarget ${pair.from}→${pair.to} #${rep} from tap miss`);
          continue;
        }
        await wait(pair.delay);
        const mid = await snap(page);
        const second = await tapDoor(page, cdp, pair.to, spec.touch);
        if (!second.accepted) {
          row.retarget.push({ pair: `${pair.from}→${pair.to}`, rep, ok: false, why: 'to-tap-miss', mid });
          row.ok = false;
          report.errors.push(`${tag}: retarget ${pair.from}→${pair.to} #${rep} to tap miss`);
          continue;
        }
        const end = await waitEntered(page, 35000);
        const hit = pair.want.test(end.panel || '') || pair.want.test(end.interior || '');
        const leftSpawn = Math.hypot((end.cx ?? 0) - 25.5, (end.cy ?? 0) - 17) > 2.2;
        const ok = !!(end.ok && hit && !end.driving && leftSpawn);
        row.retarget.push({
          pair: `${pair.from}→${pair.to}`,
          rep,
          ok,
          ms: end.ms,
          panel: end.panel,
          interior: end.interior,
          cx: end.cx,
          cy: end.cy,
          why: ok ? '' : end.why || `hit=${hit} driving=${end.driving}`,
        });
        if (!ok) {
          row.ok = false;
          report.errors.push(`${tag}: retarget ${pair.from}→${pair.to} #${rep} ${end.why || 'miss'}`);
        }
        await tapClose(page, cdp, spec.touch);
        await waitParked(page);
      }
    }

    const groundBoard = await boardVan(page, cdp, spec.touch);
    if (!groundBoard.ok) {
      row.ok = false;
      report.errors.push(`${tag}: ground reboard failed`);
    } else {
      for (const [gx, gy] of GROUND_GOALS) {
        if (!(await snap(page)).driving) await boardVan(page, cdp, spec.touch);
        const planned = await page.evaluate(([x, y]) => {
          const j = window.__playtestQa.jac();
          const path = window.__playtestQa.jacFindDrivePath?.(x, y, true) ?? [];
          let len = 0;
          let px = j.cx;
          let py = j.cy;
          for (const n of path) {
            len += Math.hypot(n.x - px, n.y - py);
            px = n.x;
            py = n.y;
          }
          const straight = Math.hypot(x - j.cx, y - j.cy);
          return { cx: j.cx, cy: j.cy, pathN: path.length, plannedLen: len, straight };
        }, [gx, gy]);
        const tap = await tapTile(page, cdp, gx, gy, spec.touch);
        if (!tap.accepted) {
          row.ground.push({ gx, gy, ok: false, why: 'tap-miss-no-fallback' });
          row.ok = false;
          report.errors.push(`${tag}: ground (${gx},${gy}) real tap did not set goal`);
          continue;
        }
        const end = await waitArrive(page, gx, gy);
        const travel = Math.hypot((end.cx ?? 0) - (planned.cx ?? 0), (end.cy ?? 0) - (planned.cy ?? 0));
        const ratio = planned.straight > 0.2 ? travel / planned.straight : 0;
        const plannedRatio = planned.straight > 0.2 ? planned.plannedLen / planned.straight : 0;
        const pathOk = ratio <= 1.5 || (plannedRatio > 1.5 && ratio <= plannedRatio + 0.12);
        const ok = !!(end.ok && pathOk);
        row.ground.push({
          gx,
          gy,
          ok,
          ms: end.ms,
          dist: end.dist,
          ratio,
          plannedRatio,
          why: ok ? '' : end.why || `ratio ${ratio.toFixed(2)}×`,
        });
        if (!ok) {
          row.ok = false;
          report.errors.push(`${tag}: ground (${gx},${gy}) ${end.why || `ratio ${ratio.toFixed(2)}×`}`);
        }
      }
    }
  } catch (err) {
    row.ok = false;
    report.errors.push(`${tag}: ${err?.message ?? err}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return row;
}

function fmt(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '—';
}

function table(widths) {
  const lines = [
    '# r23 sequential real-tap',
    '',
    `base: ${report.base}`,
    `hash: ${report.hash}`,
    `probed: ${report.startedAt} → ${new Date().toISOString()}`,
    '',
    'Fixes: desktop mouse door clicks no longer depend on Pixi pointertap surviving camera follow;',
    'a still click uses the pointerup path. Case preview × / Salir / Back hide in one tap.',
    '',
  ];
  for (const spec of WIDTHS) {
    const w = widths[spec.tag];
    if (!w) continue;
    lines.push(`## ${spec.tag} ${w.ok ? 'OK' : 'FAIL'}`);
    lines.push('');
    lines.push('| kind | target | ok | ms | pos | extra |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const d of w.doors) {
      lines.push(
        `| door | ${d.name} | ${d.ok ? 'OK' : 'FAIL'} | ${d.ms ?? ''} | ${fmt(d.cx)},${fmt(d.cy)} | ${d.why || d.panel || d.interior || ''} |`,
      );
    }
    for (const r of w.retarget) {
      lines.push(
        `| retarget | ${r.pair} #${r.rep} | ${r.ok ? 'OK' : 'FAIL'} | ${r.ms ?? ''} | ${fmt(r.cx)},${fmt(r.cy)} | ${r.panel || r.why || ''} |`,
      );
    }
    for (const g of w.ground) {
      lines.push(
        `| ground | (${g.gx},${g.gy}) | ${g.ok ? 'OK' : 'FAIL'} | ${g.ms ?? ''} | d=${fmt(g.dist)} | travel=${fmt(g.ratio)}× planned=${fmt(g.plannedRatio)}× ${g.why || ''} |`,
      );
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
  const w = report.widths[spec.tag];
  log(
    JSON.stringify(
      {
        tag: spec.tag,
        ok: w.ok,
        doors: w.doors.map((d) => [d.name, d.ok, d.ms]),
        retarget: w.retarget.map((r) => [r.pair, r.rep, r.ok]),
        ground: w.ground.map((g) => [g.gx, g.gy, g.ok]),
      },
      null,
      2,
    ),
  );
}

report.finishedAt = new Date().toISOString();
const md = table(report.widths);
fs.writeFileSync(path.join(OUT, 'tables.md'), md);
fs.writeFileSync(path.join(OUT, 'r23-seq.json'), JSON.stringify(report, null, 2));
log('\n' + md);
if (report.errors.length) process.exitCode = 1;
