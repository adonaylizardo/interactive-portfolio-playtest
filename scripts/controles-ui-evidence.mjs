/**
 * Controls UI gate — 6 states × 3 viewports vs docs/ref/controles-ui (deployed build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(ROOT, 'docs', 'ref', 'controles-ui');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona', 'controles-ui');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const STATES = [
  { id: '1-controles-primera-visita', refSuffix: '1-controles-primera-visita' },
  { id: '2-aviso-puerta', refSuffix: '2-aviso-puerta' },
  { id: '3a-t9-subir', refSuffix: '3a-t9-subir' },
  { id: '3b-t9-conduciendo-bajar', refSuffix: '3b-t9-conduciendo-bajar' },
  { id: '4a-camara-cenital', refSuffix: '4a-camara-cenital' },
  { id: '4b-camara-tercera-persona', refSuffix: '4b-camara-tercera-persona' },
];

const VIEWPORTS = [
  { tag: 'telefono-vertical', w: 390, h: 844, touch: true },
  { tag: 'telefono-horizontal', w: 844, h: 390, touch: true },
  { tag: 'desktop', w: 1440, h: 900, touch: false },
];

function refPath(vpTag, suffix) {
  return path.join(REF, `${vpTag}_${suffix}@2x.png`);
}

function sideBySide(oursPath, refPath, destPath) {
  const ours = PNG.sync.read(fs.readFileSync(oursPath));
  if (!fs.existsSync(refPath)) {
    fs.copyFileSync(oursPath, destPath);
    return { refMissing: true, diffPx: null, diffPct: null };
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
  let diffPx = 0;
  const total = a.width * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < a.width; x++) {
      const ai = (y * a.width + x) * 4;
      const bi = (y * b.width + Math.min(x, b.width - 1)) * 4;
      const dr = Math.abs(a.data[ai] - b.data[bi]);
      const dg = Math.abs(a.data[ai + 1] - b.data[bi + 1]);
      const db = Math.abs(a.data[ai + 2] - b.data[bi + 2]);
      if (dr + dg + db > 48) diffPx += 1;
    }
  }
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
  return { refMissing: false, diffPx, diffPct: (100 * diffPx) / total };
}

async function cdpTouch(cdp, x, y) {
  const pt = [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tapCenter(page, cdp, touch, sel) {
  const el = page.locator(sel).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await cdpTouch(cdp, x, y);
  else await page.mouse.click(x, y);
  await wait(350);
  return true;
}

async function hitTestControls(page) {
  return page.evaluate(() => {
    const sel = [
      '.persona-kit__cam-opt[data-cam="cenital"]',
      '.persona-kit__cam-opt[data-cam="persona"]',
      '.persona-kit__lang',
      '.persona-kit__help',
      '.chrome__tools-phone [data-action="sound"], .chrome__tools-stack [data-action="sound"]',
      '.chrome__locate',
      '.joystick',
    ];
    const joy = document.querySelector('.joystick');
    const joyBox = joy && !joy.hidden ? joy.getBoundingClientRect() : null;
    const out = [];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const hit = top === el || el.contains(top);
      let overlapsJoy = false;
      if (joyBox && s !== '.joystick') {
        overlapsJoy =
          r.left < joyBox.right &&
          r.right > joyBox.left &&
          r.top < joyBox.bottom &&
          r.bottom > joyBox.top;
      }
      out.push({
        sel: s,
        w: Math.round(r.width),
        h: Math.round(r.height),
        hit,
        overlapsJoy,
      });
    }
    const prompt = document.querySelector('.persona-enter-prompt:not([hidden])');
    const jac = document.querySelector('.persona-jac-board:not([hidden])');
    const overlapJoy = (el) => {
      if (!el || !joyBox) return false;
      const r = el.getBoundingClientRect();
      return r.left < joyBox.right && r.right > joyBox.left && r.top < joyBox.bottom && r.bottom > joyBox.top;
    };
    return {
      controls: out,
      promptOverlapsJoy: overlapJoy(prompt),
      jacOverlapsJoy: overlapJoy(jac),
    };
  });
}

async function prepareBase(page, touch) {
  await page.evaluate(() => {
    localStorage.removeItem('portfolio-persona-controls-v1');
    window.__playtestQa.setLayout?.(touch ? 'split' : 'map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.setViewMode?.('cenital');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, { timeout: 60000 });
  await wait(500);
}

async function closeOverlay(page, cdp, touch) {
  await tapCenter(page, cdp, touch, '.persona-kit__primary, .persona-kit__close');
  await wait(300);
}

async function reachDoorOffer(page, cdp, touch) {
  await page.evaluate(() => window.__playtestQa.frameDoorForQa('estudio'));
  await wait(800);
  await page.evaluate(() => window.__playtestQa.setCharacterTile(12, 14));
  await wait(400);
}

async function reachJacBoard(page) {
  await page.evaluate(() => {
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(Math.round(door.x), Math.round(door.y));
  });
  await wait(600);
  await page.waitForFunction(() => window.__playtestQa.personaState().jacBoard, null, { timeout: 15000 }).catch(() => null);
}

async function enterDrive(page, cdp, touch) {
  await tapCenter(page, cdp, touch, '[data-persona-jac="in"]');
  await wait(900);
  return page.evaluate(() => Boolean(window.__playtestQa.jac()?.driving));
}

async function captureState(page, cdp, touch, stateId) {
  switch (stateId) {
    case '1-controles-primera-visita':
      await prepareBase(page, touch);
      break;
    case '2-aviso-puerta':
      await closeOverlay(page, cdp, touch);
      await reachDoorOffer(page, cdp, touch);
      break;
    case '3a-t9-subir':
      await closeOverlay(page, cdp, touch);
      await reachJacBoard(page);
      break;
    case '3b-t9-conduciendo-bajar':
      await closeOverlay(page, cdp, touch);
      await reachJacBoard(page);
      if (!(await enterDrive(page, cdp, touch))) throw new Error('drive enter failed');
      break;
    case '4a-camara-cenital':
      await closeOverlay(page, cdp, touch);
      await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
      await wait(400);
      break;
    case '4b-camara-tercera-persona':
      await closeOverlay(page, cdp, touch);
      await tapCenter(page, cdp, touch, '[data-cam="persona"]');
      await wait(600);
      break;
    default:
      break;
  }
}

async function runViewport(vp) {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    hasTouch: vp.touch,
    isMobile: vp.touch,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const rows = [];
  let bundle = '';

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, { timeout: 60000 });
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? 'dev';

    for (const st of STATES) {
      await captureState(page, cdp, vp.touch, st.id);
      const shot = path.join(OUT, `${vp.tag}_${st.id}.png`);
      await page.screenshot({ path: shot });
      const cmp = path.join(OUT, `${vp.tag}_${st.id}-vs-ref.png`);
      const ref = refPath(vp.tag, st.refSuffix);
      const { refMissing, diffPct } = sideBySide(shot, ref, cmp);
      const hits = await hitTestControls(page);
      rows.push({
        viewport: vp.tag,
        state: st.id,
        ref: path.basename(ref),
        refMissing,
        diffPct: diffPct != null ? Number(diffPct.toFixed(2)) : null,
        hitTests: hits,
        screenshot: path.basename(shot),
        compare: path.basename(cmp),
      });
    }
  } finally {
    await ctx.close();
    await browser.close();
  }

  return { viewport: vp.tag, bundle, rows };
}

const report = { base: BASE, at: new Date().toISOString(), viewports: [] };
for (const vp of VIEWPORTS) {
  report.viewports.push(await runViewport(vp));
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
