/**
 * Camaras acceptance — live preview, limiting-axis overview fill, door×5, c3 via verify.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-camaras');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/';
const EXPECT_BUNDLE = process.argv[3] ?? '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function waitForBundle(expected) {
  if (!expected) {
    const html = await fetch(BASE).then((r) => r.text());
    return html.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? '';
  }
  for (let i = 0; i < 40; i++) {
    const live = await fetch(BASE).then((r) => r.text());
    const raw = await fetch(
      'https://raw.githubusercontent.com/adonaylizardo/interactive-portfolio-playtest/gh-pages/preview-camaras/index.html',
    ).then((r) => r.text());
    const liveB = live.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? '';
    const rawB = raw.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? '';
    if (liveB && liveB === rawB && liveB === expected) return liveB;
    if (liveB && liveB === rawB && !expected) return liveB;
    await wait(15000);
  }
  throw new Error(`CDN never matched expected bundle ${expected}`);
}

async function cdpTouch(cdp, x, y) {
  const pt = [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function boot(page, touch) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.leaveInteriorNow), null, { timeout: 90000 });
  await page.evaluate((layout) => {
    window.__playtestQa.setLayout?.(layout);
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.checklist?.collapseMobile?.();
  }, 'map');
  await wait(400);
  return (
    (await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
    ))?.split('/').pop() ?? ''
  );
}

async function overviewViewport(tag, opts) {
  const touch = !!opts.hasTouch;
  const errors = [];
  const browser = await launchBrowser(chromium, {
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  let bundle = '';
  try {
    bundle = await boot(page, touch);
    await page.locator('.ui-view[data-view="cenital"]').first().click({ timeout: 15000 }).catch(async () => {
      const btn = page.locator('.ui-view[data-view="cenital"]').first();
      const box = await btn.boundingBox();
      if (box && touch) await cdpTouch(cdp, box.x + box.width / 2, box.y + box.height / 2);
    });
    await wait(350);
    if (touch) {
      const mapBtn = page.locator('.ui-view[data-view="map"]').first();
      const box = await mapBtn.boundingBox();
      if (!box) errors.push(`${tag}: map/overview button missing`);
      else if (box.width < 44 || box.height < 44) {
        errors.push(`${tag}: map button ${box.width.toFixed(0)}×${box.height.toFixed(0)} (<44px)`);
      }
    }
    await page.evaluate(() => window.__playtestQa.toggleMapOverview?.());
    await wait(450);
    const camOverview = await page.evaluate(() => window.__playtestQa.cameraViews?.());
    if (camOverview?.mode !== 'cenital') {
      errors.push(`${tag}: overview switched mode to ${camOverview?.mode}`);
    }
    if (camOverview?.altView !== 'cenital') {
      errors.push(`${tag}: overview altView ${camOverview?.altView} (expected cenital)`);
    }
    await page.evaluate(() => {
      window.__playtestQa.cenitalBuildingLabels?.();
    });
    await wait(150);
    const overview = await page.evaluate(() => window.__playtestQa.overviewCoverage?.());
    const labels = await page.evaluate(() => window.__playtestQa.cenitalBuildingLabels?.());
    await page.screenshot({ path: path.join(OUT, `${tag}-overview-accept.png`) });
    if (!overview?.mapFullyVisible) errors.push(`${tag}: map not fully visible in overview`);
    if ((overview?.limitingFill ?? 0) < 0.9) {
      errors.push(
        `${tag}: limiting ${overview?.limitingAxis} fill ${((overview?.limitingFill ?? 0) * 100).toFixed(1)}% < 90%`,
      );
    }
    const vpFill = overview?.viewportLimitingFill ?? 0;
    if (vpFill >= 0.99) {
      errors.push(`${tag}: viewport coverage stuck at ${(vpFill * 100).toFixed(1)}% (metric should reflect drawn bbox)`);
    }
    if (vpFill < 0.28) {
      errors.push(`${tag}: viewport limiting fill ${(vpFill * 100).toFixed(1)}% too small`);
    }
    if ((labels?.overlaps ?? 0) > 0) errors.push(`${tag}: label overlaps ${labels.overlaps}`);
    return { tag, errors, bundle, overview, labels };
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function waitUntil(page, fn, timeout = 22000, step = 100) {
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

async function ensureDriving(page) {
  if (await page.evaluate(() => window.__playtestQa.jac()?.driving)) return true;
  await sitByVan(page);
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
  });
  return waitUntil(page, async () =>
    (await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null,
  );
}

async function doorTapSuite() {
  const errors = [];
  const log = [];
  const browser = await launchBrowser(chromium, {
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  const canvas = page.locator('#game-canvas');
  try {
    await boot(page, true);
    await page.evaluate(() => {
      window.__playtestQa.setViewMode('cenital');
      window.__playtestQa.setNpcs?.(false);
    });
    await wait(300);
    const buildings = ['estudio', 'sambil', 'flor', 'mentoria', 'volaris'];
    for (let i = 0; i < 5; i++) {
      const name = buildings[i];
      await page.evaluate(() => {
        window.__playtestQa.leaveInteriorNow();
        window.__playtestQa.dismissBuildingPanel?.();
      });
      await wait(200);
      await page.evaluate(() => {
        const s = window.__playtestQa.jacSpawn();
        window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
        window.__playtestQa.jacStick?.(null);
      });
      await wait(150);
      const boarded = await ensureDriving(page);
      if (!boarded) {
        errors.push(`door-tap ${i + 1}/5 ${name}: never boarded`);
        log.push({ attempt: i + 1, building: name, ok: false, snap: { boarded: false } });
        continue;
      }
      await page.evaluate(() => {
        window.__playtestQa.jacSetGear('D');
        window.__playtestQa.jacSetEngine?.();
      });
      await wait(120);
      const approach = await page.evaluate((buildingName) => {
        const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === buildingName);
        window.__playtestQa.jacSetGear('D');
        let dist = 999;
        for (let i = 0; i < 900; i++) {
          const j = window.__playtestQa.jac();
          if (!b?.door || !j?.driving) return { dist, moved: false };
          dist = Math.hypot(j.cx - b.door.x, j.cy - b.door.y);
          if (dist < 5.2) return { dist, moved: true };
          const dx = (b.door.x - j.cx) / (dist || 1);
          const dy = (b.door.y - j.cy) / (dist || 1);
          window.__playtestQa.jacDriveStep(0.05, dx, dy, { render: i % 12 === 0 });
        }
        const j = window.__playtestQa.jac();
        dist = b?.door ? Math.hypot(j.cx - b.door.x, j.cy - b.door.y) : dist;
        return { dist, moved: dist < 8 };
      }, name);
      await wait(200);
      const ptPack = await page.evaluate((n) => {
        window.__playtestQa.clearDriveTapSuppress?.();
        window.__playtestQa.frameDoorForQa(n);
        const p = window.__playtestQa.doorScreenPoint(n);
        const canvas = document.querySelector('#game-canvas');
        const r = canvas?.getBoundingClientRect();
        return { p, r: r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null };
      }, name);
      const pt = ptPack.p;
      const pad = 36;
      const r = ptPack.r;
      const ptOk =
        pt?.x != null &&
        r &&
        pt.x >= r.l + pad &&
        pt.x <= r.r - pad &&
        pt.y >= r.t + pad &&
        pt.y <= r.b - pad;
      if (!ptOk) {
        errors.push(`door-tap ${i + 1}/5 ${name}: invalid doorScreenPoint ${JSON.stringify(ptPack)}`);
        log.push({ attempt: i + 1, building: name, ok: false, approach, pt: ptPack });
        continue;
      }
      await cdpTouch(cdp, pt.x, pt.y);
      await wait(180);
      const outcome = await waitUntil(
        page,
        async () => {
          await page.evaluate(() => {
            if (window.__playtestQa.isInInterior?.()) return;
            for (let k = 0; k < 48; k++) {
              window.__playtestQa.jacDriveStep(0.05, 0, 0, { render: k % 16 === 0 });
            }
          });
          return page.evaluate(() => {
            if (window.__playtestQa.isInInterior?.()) return { kind: 'interior' };
            if (window.__playtestQa.isBuildingPanelOpen?.()) return { kind: 'panel' };
            return null;
          });
        },
        28000,
      );
      const snap = await page.evaluate((n) => {
        const j = window.__playtestQa.jac();
        const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
        const d = b?.door ? Math.hypot(j.cx - b.door.x, j.cy - b.door.y) : null;
        return {
          driving: j?.driving,
          driveGoal: j?.driveGoal,
          distDoor: d,
          interior: window.__playtestQa.isInInterior?.(),
          panel: window.__playtestQa.isBuildingPanelOpen?.(),
        };
      }, name);
      const ok = !!(outcome && (outcome.kind === 'interior' || outcome.kind === 'panel'));
      log.push({ attempt: i + 1, building: name, ok, outcome, approach, pt, snap });
      if (!ok) errors.push(`door-tap ${i + 1}/5 ${name} failed`);
      await page.evaluate(() => {
        window.__playtestQa.jacGetOut?.();
        window.__playtestQa.leaveInteriorNow();
        window.__playtestQa.dismissBuildingPanel?.();
      });
      await wait(500);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, '390-door-tap-log.json'), JSON.stringify(log, null, 2));
  return { errors, log, pass: log.filter((x) => x.ok).length };
}

const bundleTarget = EXPECT_BUNDLE || (await waitForBundle(process.argv[3]));
console.log('Target bundle:', bundleTarget);

const overviewResults = [];
for (const [tag, opts] of [
  [
    '390',
    {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
  ],
  [
    '844x390',
    {
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
  ],
  ['1280', { viewport: { width: 1280, height: 800 } }],
]) {
  overviewResults.push(await overviewViewport(tag, opts));
}

async function roadTapNoBuildingHijack() {
  const errors = [];
  const browser = await launchBrowser(chromium, {
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  try {
    await boot(page, true);
    await page.evaluate(() => {
      window.__playtestQa.setViewMode('cenital');
      window.__playtestQa.dismissBuildingPanel?.();
    });
    await wait(250);
    const boarded = await ensureDriving(page);
    if (!boarded) {
      errors.push('road-tap: never boarded van');
      return { errors };
    }
    const pt = await page.evaluate(() => {
      const tx = 47;
      const ty = 19;
      const wx = (tx - ty) * 64;
      const wy = (tx + ty) * 32;
      return window.__playtestQa.worldToClient(wx, wy);
    });
    const pick = await page.evaluate(
      ([x, y]) => window.__playtestQa.pickAt(x, y),
      [pt.x, pt.y],
    );
    if (pick?.door || pick?.building) {
      errors.push(`road-tap: pickAt reports building/door ${JSON.stringify(pick)} before tap`);
    }
    await cdpTouch(cdp, pt.x, pt.y);
    await wait(220);
    const opened = await page.evaluate(() => window.__playtestQa.isBuildingPanelOpen?.());
    const title = await page.evaluate(() => window.__playtestQa.openPanelTitle?.());
    if (opened) {
      errors.push(`road-tap: opened panel ${title ?? '?'} from road tile (47,19)`);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { errors };
}

const roadTap = await roadTapNoBuildingHijack();

const doors1 = await doorTapSuite();
const doors2 = await doorTapSuite();
const doors = {
  pass: Math.min(doors1.pass, doors2.pass),
  errors: [...doors1.errors, ...doors2.errors.map((e) => `r2: ${e}`)],
  log: { round1: doors1.log, round2: doors2.log },
};

const verify = spawnSync(
  'node',
  ['scripts/verify-preview-camaras.mjs', BASE],
  {
    cwd: ROOT,
    env: { ...process.env, QA_GL: process.env.QA_GL ?? 'llvmpipe' },
    encoding: 'utf8',
  },
);

fs.writeFileSync(path.join(OUT, 'verify-accept-run.log'), verify.stdout + verify.stderr);

const verifyOk = verify.status === 0;
const overviewOk = overviewResults.every((r) => r.errors.length === 0);
const roadOk = roadTap.errors.length === 0;
const doorsOk = doors1.pass === 5 && doors2.pass === 5 && doors.errors.length === 0;
const bundleOk = overviewResults.every((r) => r.bundle === bundleTarget);

const report = {
  ok: verifyOk && overviewOk && roadOk && doorsOk && bundleOk,
  roadTap,
  liveUrl: BASE,
  verifiedBundle: bundleTarget,
  overviewResults,
  doors,
  verifyExit: verify.status,
  at: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, 'accept-report.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
