#!/usr/bin/env node
/**
 * JAC T9 interaction: 8 Pixel states at 375 touch and 1280 desktop.
 * Usage: node scripts/verify-jac-drive.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'jac-drive');
const PIXEL = path.join(ROOT, 'portfolio', 'jac-t9-ui');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const STATES = [
  { id: '1-menu', pixelPhone: 'phone-1-menu.png', pixelDesk: 'desktop-1-menu.png' },
  { id: '2-info-auto', pixelPhone: 'phone-2-info-auto.png', pixelDesk: 'desktop-2-info-auto.png' },
  { id: '3-info-on', pixelPhone: 'phone-3-info-on.png', pixelDesk: 'desktop-3-info-on.png' },
  { id: '4-drive', pixelPhone: 'phone-4-drive.png', pixelDesk: 'desktop-4-drive.png' },
  { id: '5-out', pixelPhone: 'phone-5-out.png', pixelDesk: 'desktop-5-out.png' },
  { id: '6-out-bubble', pixelPhone: 'phone-6-out-bubble.png', pixelDesk: 'desktop-6-out-bubble.png' },
  { id: '7-rearcam-straight', pixelPhone: 'phone-7-rearcam-straight.png', pixelDesk: 'desktop-7-rearcam-straight.png' },
  { id: '8-rearcam-curve', pixelPhone: 'phone-8-rearcam-curve.png', pixelDesk: 'desktop-8-rearcam-curve.png' },
];

fs.mkdirSync(OUT, { recursive: true });

function sideBySide(oursPath, pixelPath, destPath) {
  const ours = PNG.sync.read(fs.readFileSync(oursPath));
  if (!fs.existsSync(pixelPath)) {
    fs.copyFileSync(oursPath, destPath);
    return;
  }
  const pixel = PNG.sync.read(fs.readFileSync(pixelPath));
  const h = Math.max(ours.height, pixel.height);
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
  const a = scale(pixel, h);
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

async function boot(page, tag) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.isInInterior), null, { timeout: 45000 });
  await wait(400);
  const info = await page.evaluate(() => ({
    js: [...document.scripts].map((s) => s.src).filter((s) => /index-.*\.js/.test(s)),
  }));
  return { tag, loadMs: Date.now() - t0, bundle: info.js.map((s) => s.split('/').pop()).join(',') || 'dev' };
}

async function resetMap(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel();
    window.__playtestQa.clearAnim?.();
    window.__playtestQa.setCharacterTile(27, 19);
    window.__playtestQa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05);
    window.__playtestQa.setAnim?.('se', false, 0);
  });
  await wait(250);
}

async function shot(page, tag, id) {
  const dest = path.join(OUT, `${tag}-${id}.png`);
  await page.screenshot({ path: dest });
  return dest;
}

async function applyState(page, id) {
  await page.evaluate(async (id) => {
    const qa = window.__playtestQa;
    qa.leaveInteriorNow();
    qa.dismissBuildingPanel();
    qa.setLayout?.('map');
    qa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05);
    if (id === '1-menu') {
      qa.jacClose?.();
      qa.setCharacterTile(27, 19);
      qa.tapJac();
      return;
    }
    if (id === '2-info-auto') {
      qa.tapJac();
      qa.jacInfo();
      qa.jacSetLights('auto');
      return;
    }
    if (id === '3-info-on') {
      qa.tapJac();
      qa.jacInfo();
      qa.jacSetLights('on');
      return;
    }
    if (id === '4-drive') {
      qa.tapJac();
      qa.jacGetIn();
      qa.jacSetLights('auto');
      qa.jacSetGear('P');
      return;
    }
    if (id === '5-out') {
      qa.tapJac();
      qa.jacGetIn();
      qa.jacGetOut();
      qa.jacSetBubble(false);
      qa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05);
      return;
    }
    if (id === '6-out-bubble') {
      qa.tapJac();
      qa.jacGetIn();
      qa.jacGetOut();
      qa.jacSetBubble(true);
      qa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05);
      return;
    }
    if (id === '7-rearcam-straight') {
      qa.tapJac();
      qa.jacGetIn();
      qa.jacSetLights('on');
      qa.jacSetGear('R');
      qa.jacSet({ reversing: true, steering: 0 });
      return;
    }
    if (id === '8-rearcam-curve') {
      qa.tapJac();
      qa.jacGetIn();
      qa.jacSetLights('on');
      qa.jacSetGear('R');
      qa.jacSet({ reversing: true, steering: 0.8 });
    }
  }, id);
  await page
    .waitForFunction(
      (stateId) => {
        const j = window.__playtestQa.jac?.();
        if (!j) return false;
        if (stateId === '1-menu') return j.mode === 'menu';
        if (stateId.startsWith('2') || stateId.startsWith('3')) return j.mode === 'info' && j.loaded;
        if (stateId.startsWith('4') || stateId.startsWith('7') || stateId.startsWith('8'))
          return j.driving && j.loaded;
        if (stateId === '6-out-bubble') return j.bubble;
        return true;
      },
      id,
      { timeout: 8000 },
    )
    .catch(() => {});
  await wait(200);
}

async function runViewport(tag, options, phone) {
  const errors = [];
  const notes = [];
  const req404 = [];
  const consoleErrors = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  page.on('response', (res) => {
    if (res.status() >= 400) req404.push(`${res.status()} ${res.url()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    const bootInfo = await boot(page, tag);
    notes.push(`${tag} bundle ${bootInfo.bundle} load=${bootInfo.loadMs}ms`);
    await resetMap(page);

    const hint0 = await page.evaluate(() => window.__playtestQa.soundHint?.());
    notes.push(`${tag} sound-hint-boot ${JSON.stringify(hint0)}`);
    if (!hint0?.visible) errors.push(`${tag}: silent-mode hint missing at boot`);

    const car = await page.evaluate(() => {
      const fill = window.__playtestQa.fill();
      const obj = fill.objects.find((o) => o.id === 'fill/jac-t9');
      const player = window.__playtestQa.playerAvatar();
      const blocked = [];
      for (let y = 16; y <= 18; y++) {
        for (let x = 23; x <= 27; x++) {
          if (fill.walk[y][x] !== '#') blocked.push([x, y]);
        }
      }
      return {
        scale: obj?.scale,
        h: obj?.h,
        cells: obj?.cells,
        blocked,
        avatarH: player.adonay.worldH,
        roofRatio: obj && player.adonay.worldH ? (125 * (obj.scale ?? 1)) / player.adonay.worldH : null,
      };
    });
    notes.push(`${tag} car ${JSON.stringify(car)}`);
    if (!car.scale) errors.push(`${tag}: JAC T9 missing from fill`);
    if (Math.abs((car.scale ?? 0) - 1.6) > 1e-6) errors.push(`${tag}: JAC scale ${car.scale}, want 1.6`);
    if (car.h != null && Math.abs(car.h - 192 * 1.6) > 1) {
      errors.push(`${tag}: JAC drawn height ${car.h}, want ${192 * 1.6}`);
    }
    if (car.blocked?.length) errors.push(`${tag}: JAC footprint not solid: ${JSON.stringify(car.blocked)}`);
    if (car.roofRatio != null && (car.roofRatio < 1.85 || car.roofRatio > 2.2)) {
      errors.push(`${tag}: JAC/avatar ${car.roofRatio.toFixed(3)}, want ~2.0`);
    }
    await page.evaluate(() => {
      window.__playtestQa.setCharacterTile(27, 19);
      window.__playtestQa.setAnim?.('se', false, 0);
      window.__playtestQa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05);
    });
    await wait(200);
    await shot(page, tag, 'parked-avatar');

    await wait(4200);
    const hint1 = await page.evaluate(() => window.__playtestQa.soundHint?.());
    notes.push(`${tag} sound-hint-after ${JSON.stringify(hint1)}`);
    if (hint1?.visible) errors.push(`${tag}: silent-mode hint still visible after 4s fade`);
    if (hint1?.hint === '1') errors.push(`${tag}: silent-mode hint dataset still 1 after fade`);

    for (const st of STATES) {
      await resetMap(page);
      await applyState(page, st.id);
      const jac = await page.evaluate(() => window.__playtestQa.jac());
      notes.push(`${tag} ${st.id} ${JSON.stringify(jac)}`);
      if (!jac) {
        errors.push(`${tag} ${st.id}: jac snapshot null`);
        continue;
      }
      if (st.id === '1-menu' && jac.mode !== 'menu') errors.push(`${tag} menu: mode ${jac.mode}`);
      if (st.id === '2-info-auto' && (jac.mode !== 'info' || jac.lights !== 'auto')) {
        errors.push(`${tag} info-auto: mode=${jac.mode} lights=${jac.lights}`);
      }
      if (st.id === '3-info-on' && (jac.mode !== 'info' || !jac.lightsOn)) {
        errors.push(`${tag} info-on: mode=${jac.mode} lightsOn=${jac.lightsOn}`);
      }
      if (st.id === '4-drive' && !jac.driving) errors.push(`${tag} drive: not driving`);
      if (st.id === '5-out' && (jac.driving || jac.bubble)) errors.push(`${tag} out: driving=${jac.driving} bubble=${jac.bubble}`);
      if (st.id === '6-out-bubble' && !jac.bubble) errors.push(`${tag} bubble missing`);
      if (st.id === '7-rearcam-straight' && !jac.rearCam) errors.push(`${tag} rearcam straight missing`);
      if (st.id === '8-rearcam-curve' && !jac.rearCam) errors.push(`${tag} rearcam curve missing`);
      const ours = await shot(page, tag, st.id);
      const pixel = path.join(PIXEL, phone ? st.pixelPhone : st.pixelDesk);
      sideBySide(ours, pixel, path.join(OUT, `${tag}-${st.id}-vs-pixel.png`));
    }

    await resetMap(page);
    const labels = await page.evaluate(() => window.__playtestQa.nameLabels?.() ?? []);
    if (!labels.some((l) => l.id === 'adonay')) errors.push(`${tag}: Adonay pill missing after reset`);
    notes.push(`${tag} pills ${labels.map((l) => l.id).join(',')}`);

    if (phone) {
      const stick = await page.evaluate(() => window.__playtestQa.joystick());
      if (!stick?.visible) errors.push(`${tag}: joystick hidden after reset`);
    }

    const casesOk = await page.evaluate(() => {
      window.__playtestQa.showCasePreview?.('bain');
      const open = window.__playtestQa.isCasePreview?.();
      window.__playtestQa.collapseCasePreview?.();
      window.__playtestQa.dismissBuildingPanel?.();
      return open;
    });
    if (!casesOk) errors.push(`${tag}: case preview did not open`);

    const audio404 = req404.filter((u) => /\/audio\//.test(u));
    if (audio404.length) errors.push(`${tag}: audio 404s ${audio404.join(' | ')}`);
  } finally {
    await browser.close();
  }
  return { tag, errors, notes, req404, consoleErrors };
}

const results = [];
results.push(await runViewport('desktop-1280', { viewport: { width: 1280, height: 800 } }, false));
results.push(
  await runViewport(
    'mobile-375',
    { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    true,
  ),
);

const errors = results.flatMap((r) => [
  ...r.errors,
  ...r.consoleErrors.map((u) => `${r.tag} console: ${u}`),
]);
for (const r of results) {
  console.log('---', r.tag);
  for (const n of r.notes) console.log(' ', n);
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, errors }, null, 2));
if (errors.length) {
  for (const e of errors) console.error('FAIL', e);
  process.exit(1);
}
console.log('verify-jac-drive: ok');
console.log('shots', OUT);
