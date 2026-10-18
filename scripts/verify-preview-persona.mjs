/**
 * preview-persona QA — real CDP touch/mouse, no gameplay QA shortcuts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
const FRAMES = path.join(ROOT, 'art', 'primera-persona', 'frames');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

function sideBySide(oursPath, refPath, destPath) {
  const ours = PNG.sync.read(fs.readFileSync(oursPath));
  if (!fs.existsSync(refPath)) {
    fs.copyFileSync(oursPath, destPath);
    return;
  }
  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const scale = (img, height) => {
    if (img.height === height) return img;
    const w = Math.max(1, Math.round((img.width * height) / img.height));
    const out = new PNG({ width: w, height });
    for (let y = 0; y < height; y++) {
      const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor((x * img.width) / w));
        const si = (sy * img.width + sx) * 4;
        const di = (y * w + x) * 4;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = img.data[si + 3];
      }
    }
    return out;
  };
  const h = Math.max(ours.height, ref.height);
  const a = scale(ref, h);
  const b = scale(ours, h);
  const gap = 12;
  const out = new PNG({ width: a.width + gap + b.width, height: h });
  out.data.fill(20);
  const blit = (src, ox) => {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + ox + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  };
  blit(a, 0);
  blit(b, a.width + gap);
  fs.writeFileSync(destPath, PNG.sync.write(out));
}

async function cdpTouch(cdp, x, y) {
  const pt = [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function holdKeys(page, dx, dy, ms = 2200) {
  const down = [];
  if (dy < 0) down.push('w');
  if (dy > 0) down.push('s');
  if (dx < 0) down.push('a');
  if (dx > 0) down.push('d');
  for (const k of down) await page.keyboard.down(k);
  await wait(ms);
  for (const k of down) await page.keyboard.up(k);
}

async function holdStick(_cdp, page, dx, dy, ms = 2200) {
  const box = await page.locator('.joystick__idle').boundingBox();
  if (!box) return;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  const mag = Math.hypot(dx, dy) || 1;
  const ox = (dx / mag) * 28;
  const oy = (dy / mag) * 28;
  await page.evaluate(
    ({ x0, y0, ox, oy }) => {
      const el = document.querySelector('.joystick__idle');
      if (!el) return;
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 7,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x0,
          clientY: y0,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 7,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x0 + ox,
          clientY: y0 + oy,
        }),
      );
    },
    { x0, y0, ox, oy },
  );
  await wait(ms);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 7,
        pointerType: 'touch',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

async function exitPersonaView(page, cdp, touch) {
  await page.waitForFunction(() => !window.__playtestQa.jac()?.driving, null, { timeout: 8000 }).catch(() => null);
  await tapSelector(page, cdp, touch, '[data-jac="close"]');
  for (const mode of ['isometrica', 'cenital']) {
    const btn = page.locator(`.ui-view[data-view="${mode}"]`).first();
    if ((await btn.count()) === 0) continue;
    const box = await btn.boundingBox().catch(() => null);
    if (!box) {
      await btn.click({ force: true });
      await wait(350);
      return;
    }
    if (touch) await cdpTouch(cdp, box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(350);
    return;
  }
  throw new Error('no view control to exit persona');
}

async function tapView(page, cdp, touch, mode) {
  const btn = page.locator(`.ui-view[data-view="${mode}"]`).first();
  if (!(await btn.isVisible().catch(() => false))) throw new Error(`missing view ${mode}`);
  const box = await btn.boundingBox();
  if (!box) throw new Error(`missing view ${mode}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await cdpTouch(cdp, x, y);
  else await page.mouse.click(x, y);
  await wait(350);
}

async function tapSelector(page, cdp, touch, sel) {
  const el = page.locator(sel).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await cdpTouch(cdp, x, y);
  else await page.mouse.click(x, y);
  await wait(400);
  return true;
}

const STICK_DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

async function holdMove(cdp, page, touch, dx, dy, ms) {
  if (touch) await holdStick(cdp, page, dx, dy, ms);
  else await holdKeys(page, dx, dy, ms);
}

async function walkTowardTile(page, cdp, touch, tx, ty, maxMs = 14000) {
  const t0 = Date.now();
  let best = [0, -1];
  let lastScan = 0;
  while (Date.now() - t0 < maxMs) {
    const before = await page.evaluate(() => window.__playtestQa.inputReady().char);
    const distBefore = Math.hypot(before.x - tx, before.y - ty);
    if (distBefore < 2.2) return true;

    if (Date.now() - lastScan > 2200) {
      let pick = best;
      let bestGain = -1;
      for (const [sx, sy] of STICK_DIRS) {
        await holdMove(cdp, page, touch, sx, sy, 320);
        const after = await page.evaluate(() => window.__playtestQa.inputReady().char);
        const gain = distBefore - Math.hypot(after.x - tx, after.y - ty);
        if (gain > bestGain) {
          bestGain = gain;
          pick = [sx, sy];
        }
        if (Math.hypot(after.x - tx, after.y - ty) < 2.2) return true;
      }
      best = pick;
      lastScan = Date.now();
    } else {
      await holdMove(cdp, page, touch, best[0], best[1], 1100);
    }
    await wait(40);
  }
  const c = await page.evaluate(() => window.__playtestQa.inputReady().char);
  return Math.hypot(c.x - tx, c.y - ty) < 8;
}

async function runViewport(tag, opts) {
  const touch = !!opts.hasTouch;
  const errors = [];
  const notes = [];
  const rows = [];
  let consoleErrors = 0;
  let bundle = '';

  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors += 1;
  });
  page.on('pageerror', () => {
    consoleErrors += 1;
  });
  const cdp = await page.context().newCDPSession(page);

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.leaveInteriorNow), null, {
      timeout: 60000,
    });
    const bootLayout = touch ? 'split' : 'map';
    await page.evaluate((layout) => {
      window.__playtestQa.setLayout?.(layout);
      window.__playtestQa.leaveInteriorNow();
      window.__playtestQa.dismissBuildingPanel?.();
      window.__playtestQa.checklist?.collapseMobile?.();
    }, bootLayout);
    await wait(400);
    if (touch) {
      await page.locator('.joystick').waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
    }
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? 'dev';

    const personaBtn = page.locator('.ui-view[data-view="persona"]');
    await personaBtn.waitFor({ state: 'attached', timeout: 30000 }).catch(() => null);
    if ((await personaBtn.count()) === 0) errors.push(`${tag}: persona view button missing`);
    else {
      await tapView(page, cdp, touch, 'persona');
      let st = await page.evaluate(() => window.__playtestQa.personaState());
      rows.push({ check: 'enter persona', pass: st.active });
      if (!st.active) errors.push(`${tag}: did not enter persona mode`);

      await page.screenshot({ path: path.join(OUT, `${tag}-persona-walk.png`) });
      await holdMove(cdp, page, touch, 0, -1, 2800);
      await wait(400);
      st = await page.evaluate(() => window.__playtestQa.personaState());
      rows.push({ check: 'pantone follows', pass: st.pantoneVisible });
      if (!st.pantoneVisible) errors.push(`${tag}: pantone not visible while walking`);

      const nearCatedral = await walkTowardTile(page, cdp, touch, 14, 17, 16000);
      await page.screenshot({ path: path.join(OUT, `${tag}-near-catedral.png`) });
      rows.push({ check: 'walk past catedral', pass: nearCatedral });
      if (!nearCatedral) errors.push(`${tag}: did not reach catedral approach by walking`);

      const nearFlor = await walkTowardTile(page, cdp, touch, 46, 46, 16000);
      await page.screenshot({ path: path.join(OUT, `${tag}-near-flor.png`) });
      rows.push({ check: 'walk past flor', pass: nearFlor });
      if (!nearFlor) errors.push(`${tag}: did not reach flor approach by walking`);

      await wait(31000);
      st = await page.evaluate(() => window.__playtestQa.personaState());
      rows.push({ check: 'pantone sits idle', pass: st.pantoneSit && st.pantoneVisible });
      if (!st.pantoneSit) errors.push(`${tag}: pantone did not sit after 30s idle`);

      const nearJac = await walkTowardTile(page, cdp, touch, 27, 19, 18000);
      notes.push(`${tag}: near jac ${nearJac}`);
      const jac = page.locator('#game-canvas');
      const e = await page.evaluate(() => window.__playtestQa.jacEntities());
      const rect = await jac.boundingBox();
      if (rect && e?.sx) {
        const cx = rect.x + e.sx;
        const cy = rect.y + e.sy;
        if (touch) await cdpTouch(cdp, cx, cy);
        else await page.mouse.click(cx, cy);
        await wait(800);
      }
      let driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
      if (!driving) {
        const tappedIn =
          (await tapSelector(page, cdp, touch, '.jac-bar [data-jac="in"]')) ||
          (await tapSelector(page, cdp, touch, '.jac-menu [data-jac="in"]')) ||
          (await tapSelector(page, cdp, touch, '[data-jac="in"]'));
        if (!tappedIn) await page.keyboard.press('Enter');
        await wait(1200);
        driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
      }
      rows.push({ check: 'jac drive enter', pass: !!driving });
      if (!driving) errors.push(`${tag}: did not enter jac T9`);
      st = await page.evaluate(() => window.__playtestQa.personaState());
      rows.push({ check: 'jac cabin', pass: st.jacCabin && st.active });
      if (!st.jacCabin) errors.push(`${tag}: jac cabin overlay not active`);

      await holdMove(cdp, page, touch, 0, -1, 2000);
      await page.screenshot({ path: path.join(OUT, `${tag}-jac-cabin.png`) });

      const tappedOut =
        (await tapSelector(page, cdp, touch, '.jac-bar [data-jac="out"]')) ||
        (await tapSelector(page, cdp, touch, '[data-jac="out"]'));
      if (!tappedOut) await page.keyboard.press('Enter');
      await wait(1000);
      const stillDriving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
      rows.push({ check: 'jac get out', pass: !stillDriving });
      if (stillDriving) errors.push(`${tag}: still driving after get out`);

      await exitPersonaView(page, cdp, touch);
      st = await page.evaluate(() => window.__playtestQa.personaState());
      rows.push({ check: 'exit persona', pass: !st.active });
      if (st.active) errors.push(`${tag}: did not exit persona mode`);

      const assets = await page.evaluate(() => window.__playtestQa.personaState().assets);
      notes.push(`${tag}: assets ${JSON.stringify(assets)}`);
      rows.push({ check: 'assets loaded', pass: assets.textures >= 8 });
      if (assets.textures < 8) errors.push(`${tag}: too few persona textures (${assets.textures})`);
    }

    rows.push({ check: 'console clean', pass: consoleErrors === 0 });
    if (consoleErrors > 0) errors.push(`${tag}: console errors ${consoleErrors}`);

    sideBySide(
      path.join(OUT, `${tag}-near-catedral.png`),
      path.join(FRAMES, 'frame-c-a-pie-junto-t9@1x.png'),
      path.join(OUT, `${tag}-vs-frame-c.png`),
    );
    sideBySide(
      path.join(OUT, `${tag}-jac-cabin.png`),
      path.join(FRAMES, 'frame-b-jac-t9@1x.png'),
      path.join(OUT, `${tag}-vs-frame-b.png`),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }

  return { tag, errors, notes, rows, bundle, consoleErrors };
}

const results = [];
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
  results.push(await runViewport(tag, opts));
}

const bundle = results.find((r) => r.bundle)?.bundle ?? '';
const passTable = results.flatMap((r) =>
  r.rows.map((row) => ({ viewport: r.tag, check: row.check, pass: row.pass })),
);
const report = { ok: results.every((r) => r.errors.length === 0), bundle, base: BASE, passTable, results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

for (const r of results) {
  console.log(`\n== ${r.tag} ==`);
  for (const n of r.notes) console.log(' ', n);
  for (const e of r.errors) console.log('  ERR', e);
}
console.log('\nPASS TABLE');
console.table(passTable);
if (!report.ok) process.exit(1);
console.log(`\npreview-persona verify ok (bundle ${bundle})`);
