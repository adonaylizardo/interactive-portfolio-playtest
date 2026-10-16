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
  // domcontentloaded + qa-ready wait: do not sit on networkidle or the 4s hint is already gone.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const hint = await page.evaluate(() => window.__playtestQa.soundHint?.());
  const info = await page.evaluate(() => ({
    js: [...document.scripts].map((s) => s.src).filter((s) => /index-.*\.js/.test(s)),
  }));
  return {
    tag,
    loadMs: Date.now() - t0,
    bundle: info.js.map((s) => s.split('/').pop()).join(',') || 'dev',
    hint,
  };
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

async function holdStick(page, ox, oy) {
  const box = await page.locator('.joystick__idle').boundingBox();
  if (!box) return false;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
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
  return true;
}

async function releaseStick(page) {
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

/** Fast 150ms touch swipe (DevTools-style) — must drive the stick, not pan the camera. */
async function swipe150(page, x0, y0, x1, y1) {
  await page.evaluate(
    async ({ x0, y0, x1, y1 }) => {
      const fire = (type, x, y, extra = {}) => {
        const ev = new PointerEvent(type, {
          pointerId: 11,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          ...extra,
        });
        const hit = document.elementFromPoint(x, y);
        if (type === 'pointerdown' && hit) hit.dispatchEvent(ev);
        else window.dispatchEvent(ev);
      };
      fire('pointerdown', x0, y0);
      await new Promise((r) => setTimeout(r, 40));
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 11,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x1,
          clientY: y1,
        }),
      );
      await new Promise((r) => setTimeout(r, 110));
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 11,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x1,
          clientY: y1,
        }),
      );
    },
    { x0, y0, x1, y1 },
  );
}


function dist(a, b) {
  return Math.hypot((a?.cx ?? 0) - (b?.cx ?? 0), (a?.cy ?? 0) - (b?.cy ?? 0));
}

async function hiddenHitTargets(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[hidden]')].flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return [];
      const cs = getComputedStyle(el);
      return [
        {
          cls: (el.className || el.tagName).toString().slice(0, 80),
          w: Math.round(r.width),
          h: Math.round(r.height),
          y: Math.round(r.y),
          display: cs.display,
          pe: cs.pointerEvents,
        },
      ];
    }),
  );
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
      qa.jacSetBubble(false);
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
        if (stateId === '6-out-bubble') return !j.driving && !j.bubble;
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
    notes.push(`${tag} sound-hint-boot ${JSON.stringify(bootInfo.hint)}`);
    if (!bootInfo.hint?.visible) errors.push(`${tag}: silent-mode hint missing at boot`);
    await shot(page, tag, 'sound-hint');

    if (!phone) {
      const beforeKeys = await page.evaluate(() => ({
        tile: window.__playtestQa.getCharacterTile(),
        focus: document.activeElement?.id || document.activeElement?.tagName || null,
      }));
      notes.push(`${tag} canvas-focus ${beforeKeys.focus}`);
      if (beforeKeys.focus !== 'game-canvas') {
        errors.push(`${tag}: canvas was not focused on load (active=${beforeKeys.focus})`);
      }
      let afterKeys = beforeKeys.tile;
      for (const key of ['ArrowLeft', 'KeyA', 'ArrowDown', 'ArrowUp', 'ArrowRight']) {
        await page.keyboard.down(key);
        await wait(550);
        await page.keyboard.up(key);
        afterKeys = await page.evaluate(() => window.__playtestQa.getCharacterTile());
        if (afterKeys.x !== beforeKeys.tile.x || afterKeys.y !== beforeKeys.tile.y) break;
      }
      notes.push(`${tag} arrows-no-click ${JSON.stringify({ before: beforeKeys.tile, after: afterKeys })}`);
      if (afterKeys.x === beforeKeys.tile.x && afterKeys.y === beforeKeys.tile.y) {
        errors.push(`${tag}: arrow keys did nothing before canvas click`);
      }
    }

    if (phone) {
      const sheetHit = await page.evaluate(() => {
        const cliente = document.querySelector('.ui-seg--phone [data-audience="cliente"]')?.getBoundingClientRect();
        const locate = document.querySelector('.chrome__locate')?.getBoundingClientRect();
        const idle = document.querySelector('.joystick__idle');
        const idleR = idle?.getBoundingClientRect();
        const vis = (r) => r && r.width > 2 && r.height > 2;
        const area = (a, b) => {
          if (!a || !b) return 0;
          return (
            Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
          );
        };
        const idleShown = idle && vis(idleR) && getComputedStyle(idle).opacity !== '0' && getComputedStyle(idle).pointerEvents !== 'none';
        return {
          cliente: vis(cliente) ? { x: cliente.x, w: cliente.width, t: cliente.top, h: cliente.height } : null,
          locateArea: vis(locate) ? area(cliente, locate) : 0,
          idleArea: idleShown ? area(cliente, idleR) : 0,
        };
      });
      notes.push(`${tag} cliente-overlap ${JSON.stringify(sheetHit)}`);
      if (sheetHit.locateArea > 4) errors.push(`${tag}: recentre overlaps Cliente (${sheetHit.locateArea})`);
      if (sheetHit.idleArea > 4) errors.push(`${tag}: joystick idle overlaps Cliente (${sheetHit.idleArea})`);
    }

    await resetMap(page);

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
      if (st.id === '1-menu') {
        const pills = await page.evaluate(() =>
          [...document.querySelectorAll('.jac-menu__row .jac-pill')].map((el) => {
            const r = el.getBoundingClientRect();
            return { label: el.textContent?.trim(), h: r.height, w: r.width };
          }),
        );
        notes.push(`${tag} menu-pills ${JSON.stringify(pills)}`);
        for (const p of pills) {
          if (p.h < 43.5) errors.push(`${tag} menu: ${p.label} height ${p.h}, want ≥44`);
        }
      }
      if (st.id === '2-info-auto' && (jac.mode !== 'info' || jac.lights !== 'auto')) {
        errors.push(`${tag} info-auto: mode=${jac.mode} lights=${jac.lights}`);
      }
      if (st.id === '3-info-on' && (jac.mode !== 'info' || !jac.lightsOn)) {
        errors.push(`${tag} info-on: mode=${jac.mode} lightsOn=${jac.lightsOn}`);
      }
      if (st.id === '4-drive' && !jac.driving) errors.push(`${tag} drive: not driving`);
      if (st.id === '4-drive' && phone) {
        const hud = await page.evaluate(() => {
          const bar = document.querySelector('.jac-bar');
          const gears = document.querySelector('.jac-bar__gears');
          const dock = document.querySelector('.jac-dock');
          const on = [...document.querySelectorAll('.jac-bar [data-jac="gear"].is-on')].map(
            (el) => el.getAttribute('data-val'),
          );
          const gearBox = [...document.querySelectorAll('.jac-bar [data-jac="gear"]')].map((el) => {
            const r = el.getBoundingClientRect();
            return { g: el.getAttribute('data-val'), w: r.width, h: r.height };
          });
          return {
            barHidden: bar?.hidden ?? true,
            gearsCount: gears?.querySelectorAll('[data-jac="gear"]').length ?? 0,
            dockHidden: dock?.hidden ?? true,
            gearOn: on,
            gearBox,
          };
        });
        notes.push(`${tag} drive-hud ${JSON.stringify(hud)}`);
        if (hud.barHidden) errors.push(`${tag} drive: phone bar hidden`);
        if (hud.dockHidden === false) errors.push(`${tag} drive: desktop dock shown on phone`);
        if (hud.gearsCount < 4) errors.push(`${tag} drive: compact gears missing`);
        for (const g of hud.gearBox ?? []) {
          if (g.w < 43.5 || g.h < 43.5) {
            errors.push(`${tag} drive: gear ${g.g} is ${g.w}x${g.h}, want ≥44`);
          }
        }
      }
      if (st.id === '5-out' && (jac.driving || jac.bubble)) errors.push(`${tag} out: driving=${jac.driving} bubble=${jac.bubble}`);
      if (st.id === '6-out-bubble' && jac.bubble) errors.push(`${tag} placeholder bubble still on`);
      if (st.id === '2-info-auto' || st.id === '3-info-on') {
        const sheet = await page.evaluate(() => {
          const desc = document.querySelector('.jac-sheet__desc')?.textContent?.trim() ?? '';
          const ins = [...document.querySelectorAll('[data-jac="in"]')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none';
          });
          const length = document.querySelector('.jac-length')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          const toggles = [...document.querySelectorAll('.jac-toggle')].map((el) => el.getAttribute('data-val'));
          const placeholder = document.body.innerText.includes('Descripción de una línea (pendiente).');
          const bark = document.body.innerText.includes('Texto de burbuja (relleno)');
          return { desc, inCount: ins.length, length, toggles, placeholder, bark };
        });
        notes.push(`${tag} ${st.id} sheet ${JSON.stringify(sheet)}`);
        if (sheet.placeholder) errors.push(`${tag} ${st.id}: placeholder description still shown`);
        if (sheet.bark) errors.push(`${tag} ${st.id}: placeholder bubble copy still shown`);
        if (phone && sheet.inCount !== 1) errors.push(`${tag} ${st.id}: Get in count ${sheet.inCount}, want 1`);
        if (phone && !/5\.33/.test(sheet.length)) errors.push(`${tag} ${st.id}: length missing (${sheet.length})`);
        if (phone && sheet.desc && !/camioneta de la familia/.test(sheet.desc)) {
          errors.push(`${tag} ${st.id}: desc "${sheet.desc}"`);
        }
        if (sheet.toggles.some((id) => id && id !== 'hazards')) {
          errors.push(`${tag} ${st.id}: inert toggles ${JSON.stringify(sheet.toggles)}`);
        }
      }
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

      await resetMap(page);
      await applyState(page, '4-drive');
      const open = await page.evaluate(() => {
        const walk = window.__playtestQa.fill().walk;
        const clear = (x, y) => {
          for (let dy = -1; dy <= 2; dy++) {
            for (let dx = -1; dx <= 2; dx++) {
              const ch = walk[y + dy]?.[x + dx];
              if (!ch || ch === '#' || ch === 'x') return false;
            }
          }
          return true;
        };
        for (let y = 22; y < 42; y++) {
          for (let x = 22; x < 42; x++) {
            if (clear(x, y)) return { x, y };
          }
        }
        return null;
      });
      if (open) {
        await page.evaluate((p) => window.__playtestQa.jacSet({ cx: p.x, cy: p.y, dir: 'se' }), open);
        await wait(200);
      }
      const start = await page.evaluate(() => window.__playtestQa.jac());
      notes.push(`${tag} stick-start ${JSON.stringify({ gear: start?.gear, cx: start?.cx, cy: start?.cy, open })}`);
      const heldFwd = await holdStick(page, 0, -46);
      if (!heldFwd) errors.push(`${tag}: joystick idle missing for forward drive`);
      await wait(1200);
      const fwd = await page.evaluate(() => ({
        jac: window.__playtestQa.jac(),
        joy: window.__playtestQa.joystick(),
      }));
      await shot(page, tag, 'joystick-forward');
      await releaseStick(page);
      await wait(280);
      const held = await page.evaluate(() => window.__playtestQa.jac());
      const heldBack = await holdStick(page, 0, 46);
      if (!heldBack) errors.push(`${tag}: joystick idle missing for reverse drive`);
      await wait(1200);
      const rev = await page.evaluate(() => {
        const rear = document.querySelector('.jac-rear');
        const r = rear?.getBoundingClientRect();
        return {
          jac: window.__playtestQa.jac(),
          joy: window.__playtestQa.joystick(),
          rear: {
            hidden: rear?.hidden ?? true,
            w: r?.width ?? 0,
            h: r?.height ?? 0,
            body: document.body.classList.contains('jac-rearcam'),
          },
        };
      });
      await shot(page, tag, 'joystick-reverse');
      await releaseStick(page);
      notes.push(
        `${tag} stick-fwd ${JSON.stringify({ gear: fwd.jac?.gear, mph: fwd.jac?.mph, cx: fwd.jac?.cx, cy: fwd.jac?.cy, vec: fwd.joy })}`,
      );
      notes.push(
        `${tag} stick-hold ${JSON.stringify({ gear: held?.gear, mph: held?.mph, cx: held?.cx, cy: held?.cy })}`,
      );
      notes.push(
        `${tag} stick-rev ${JSON.stringify({ gear: rev.jac?.gear, rearCam: rev.jac?.rearCam, cx: rev.jac?.cx, cy: rev.jac?.cy, rear: rev.rear })}`,
      );
      if (fwd.jac?.gear !== 'D') errors.push(`${tag}: forward stick did not auto-shift to D (gear=${fwd.jac?.gear})`);
      if (dist(fwd.jac, start) < 0.35) {
        errors.push(
          `${tag}: forward stick did not move the van (start ${start?.cx},${start?.cy} → ${fwd.jac?.cx},${fwd.jac?.cy})`,
        );
      }
      if ((held?.mph ?? 1) > 0) errors.push(`${tag}: release did not brake (mph=${held?.mph})`);
      if (held?.gear !== 'D') errors.push(`${tag}: release dropped gear ${held?.gear}, want hold D`);
      if (rev.jac?.gear !== 'R') errors.push(`${tag}: reverse stick did not auto-shift to R (gear=${rev.jac?.gear})`);
      if (!rev.jac?.rearCam) errors.push(`${tag}: reverse stick did not show rear-cam`);
      if (rev.rear.hidden || rev.rear.w < 40 || rev.rear.h < 40) {
        errors.push(`${tag}: rear-cam overlay not visible (${JSON.stringify(rev.rear)})`);
      }
      if (dist(rev.jac, fwd.jac) < 0.35) {
        errors.push(
          `${tag}: reverse stick did not move the van (fwd ${fwd.jac?.cx},${fwd.jac?.cy} → ${rev.jac?.cx},${rev.jac?.cy})`,
        );
      }
      const entities = await page.evaluate(() => window.__playtestQa.jacEntities?.());
      notes.push(`${tag} van-entities ${JSON.stringify(entities)}`);
      if ((entities?.count ?? 0) !== 1) {
        errors.push(`${tag}: expected one van, got ${JSON.stringify(entities)}`);
      }

      await resetMap(page);
      const walk0 = await page.evaluate(() => window.__playtestQa.getCharacterTile());
      const heldWalk = await holdStick(page, 40, -40);
      if (!heldWalk) errors.push(`${tag}: joystick idle missing for walk`);
      await wait(900);
      const walk1 = await page.evaluate(() => ({
        tile: window.__playtestQa.getCharacterTile(),
        joy: window.__playtestQa.joystick(),
      }));
      await releaseStick(page);
      notes.push(`${tag} stick-walk ${JSON.stringify({ walk0, walk1 })}`);
      if (Math.hypot((walk1.tile?.x ?? 0) - walk0.x, (walk1.tile?.y ?? 0) - walk0.y) < 0.4) {
        errors.push(`${tag}: walking joystick did not move the character`);
      }

      await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
      await resetMap(page);
      await wait(200);
      const ground0 = await page.evaluate(() => ({
        tile: window.__playtestQa.getCharacterTile(),
        cam: document.getElementById('game-canvas')?.dataset.camX,
        follow: document.getElementById('game-canvas')?.dataset.follow,
      }));
      await swipe150(page, 188, 360, 188, 280);
      await wait(400);
      const ground1 = await page.evaluate(() => ({
        tile: window.__playtestQa.getCharacterTile(),
        cam: document.getElementById('game-canvas')?.dataset.camX,
        follow: document.getElementById('game-canvas')?.dataset.follow,
        joy: window.__playtestQa.joystick(),
      }));
      notes.push(`${tag} swipe150-ground ${JSON.stringify({ ground0, ground1 })}`);
      if (Math.hypot((ground1.tile?.x ?? 0) - ground0.tile.x, (ground1.tile?.y ?? 0) - ground0.tile.y) < 0.2) {
        errors.push(
          `${tag}: 150ms ground swipe did not move the character (${ground0.tile.x},${ground0.tile.y} → ${ground1.tile.x},${ground1.tile.y}) follow=${ground1.follow}`,
        );
      }
      if (ground1.follow === 'suspended') {
        errors.push(`${tag}: 150ms ground swipe suspended camera follow (panned)`);
      }

      await resetMap(page);
      const idleBox = await page.locator('.joystick__idle').boundingBox();
      const idle0 = await page.evaluate(() => window.__playtestQa.getCharacterTile());
      if (!idleBox) errors.push(`${tag}: joystick idle missing for 150ms swipe`);
      else {
        const cx = idleBox.x + idleBox.width / 2;
        const cy = idleBox.y + idleBox.height / 2;
        await swipe150(page, cx, cy, cx, cy - 56);
        await wait(400);
        const idle1 = await page.evaluate(() => ({
          tile: window.__playtestQa.getCharacterTile(),
          follow: document.getElementById('game-canvas')?.dataset.follow,
        }));
        notes.push(`${tag} swipe150-idle ${JSON.stringify({ idle0, idle1 })}`);
        if (Math.hypot((idle1.tile?.x ?? 0) - idle0.x, (idle1.tile?.y ?? 0) - idle0.y) < 0.2) {
          errors.push(`${tag}: 150ms idle swipe did not move the character`);
        }
        if (idle1.follow === 'suspended') errors.push(`${tag}: 150ms idle swipe panned the camera`);
      }

      await resetMap(page);
      await applyState(page, '3-info-on');
      const beforeHaz = await page.evaluate(() => window.__playtestQa.jac());
      await page.evaluate(() => window.__playtestQa.jacSetToggle('hazards'));
      await wait(80);
      const afterHaz = await page.evaluate(() => window.__playtestQa.jac());
      notes.push(`${tag} hazards ${JSON.stringify({ before: beforeHaz?.row, after: afterHaz?.row, on: afterHaz?.toggles?.hazards })}`);
      if (!afterHaz?.toggles?.hazards) errors.push(`${tag}: hazards toggle did not stick`);
      if (afterHaz?.row === beforeHaz?.row && afterHaz?.row !== 'freno') {
        errors.push(`${tag}: hazards did not change the van sprite (row ${afterHaz?.row})`);
      }
    } else {
      await resetMap(page);
      await applyState(page, '4-drive');
      const openDesk = await page.evaluate(() => {
        const walk = window.__playtestQa.fill().walk;
        const clear = (x, y) => {
          for (let dy = -1; dy <= 2; dy++) {
            for (let dx = -1; dx <= 2; dx++) {
              const ch = walk[y + dy]?.[x + dx];
              if (!ch || ch === '#' || ch === 'x') return false;
            }
          }
          return true;
        };
        for (let y = 22; y < 42; y++) {
          for (let x = 22; x < 42; x++) {
            if (clear(x, y)) return { x, y };
          }
        }
        return null;
      });
      if (openDesk) {
        await page.evaluate((p) => window.__playtestQa.jacSet({ cx: p.x, cy: p.y, dir: 'se' }), openDesk);
        await wait(200);
      }
      const startK = await page.evaluate(() => window.__playtestQa.jac());
      await page.keyboard.down('ArrowUp');
      await wait(1100);
      const upK = await page.evaluate(() => window.__playtestQa.jac());
      await page.keyboard.up('ArrowUp');
      await wait(200);
      await page.keyboard.down('KeyW');
      await wait(400);
      const wK = await page.evaluate(() => window.__playtestQa.jac());
      await page.keyboard.up('KeyW');
      await page.keyboard.down('ArrowDown');
      await wait(1100);
      const downK = await page.evaluate(() => {
        const rear = document.querySelector('.jac-rear');
        const r = rear?.getBoundingClientRect();
        const view = document.querySelector('.jac-rear__view');
        let sample = { mean: 0, var: 0 };
        if (view instanceof HTMLCanvasElement) {
          const ctx = view.getContext('2d');
          if (ctx) {
            const img = ctx.getImageData(8, 8, Math.max(4, view.width - 16), Math.max(4, view.height - 16));
            let sum = 0;
            let sum2 = 0;
            const n = img.data.length / 4;
            for (let i = 0; i < img.data.length; i += 4) {
              const v = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
              sum += v;
              sum2 += v * v;
            }
            sample = { mean: sum / n, var: sum2 / n - (sum / n) ** 2 };
          }
        }
        return {
          jac: window.__playtestQa.jac(),
          rear: { hidden: rear?.hidden ?? true, w: r?.width ?? 0, h: r?.height ?? 0, sample },
          hint: document.querySelector('.jac-hint')?.textContent?.trim() ?? '',
          entities: window.__playtestQa.jacEntities?.(),
        };
      });
      await page.keyboard.up('ArrowDown');
      notes.push(
        `${tag} keys ${JSON.stringify({
          start: { gear: startK?.gear, cx: startK?.cx, cy: startK?.cy },
          up: { gear: upK?.gear, mph: upK?.mph, cx: upK?.cx, cy: upK?.cy },
          w: { gear: wK?.gear, cx: wK?.cx },
          down: { gear: downK.jac?.gear, rearCam: downK.jac?.rearCam, cx: downK.jac?.cx, rear: downK.rear, hint: downK.hint, entities: downK.entities },
        })}`,
      );
      if (upK?.gear !== 'D') errors.push(`${tag}: ArrowUp from P did not auto-shift to D (gear=${upK?.gear})`);
      if (dist(upK, startK) < 0.35) {
        errors.push(`${tag}: ArrowUp did not drive the van (${startK?.cx},${startK?.cy} → ${upK?.cx},${upK?.cy})`);
      }
      if (wK?.gear !== 'D') errors.push(`${tag}: W did not keep/shift D (gear=${wK?.gear})`);
      if (downK.jac?.gear !== 'R') errors.push(`${tag}: ArrowDown did not auto-shift to R (gear=${downK.jac?.gear})`);
      if (!downK.jac?.rearCam) errors.push(`${tag}: ArrowDown did not show rear-cam`);
      if (downK.rear.hidden || downK.rear.w < 40) errors.push(`${tag}: rear overlay missing on desktop reverse`);
      if ((downK.rear.sample?.var ?? 0) < 12) {
        errors.push(`${tag}: rear-cam looks empty/static (var=${downK.rear.sample?.var})`);
      }
      if ((downK.entities?.count ?? 0) !== 1) {
        errors.push(`${tag}: expected one van after keyboard drive, got ${JSON.stringify(downK.entities)}`);
      }

      await resetMap(page);
      const langVs = await page.evaluate(() => {
        const lang = document.querySelector('.chrome__lang');
        const cl = document.querySelector('.checklist');
        const locate = document.querySelector('.chrome__locate');
        const a = lang?.getBoundingClientRect();
        const b = cl?.getBoundingClientRect();
        const c = locate?.getBoundingClientRect();
        const overlap = (p, q) => {
          if (!p || !q || p.width < 2 || q.width < 2) return 0;
          return Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left)) *
            Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top));
        };
        return {
          lang: a ? { x: a.x, y: a.y, w: a.width, h: a.height } : null,
          checklist: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null,
          locate: c && c.width > 2 ? { x: c.x, y: c.y, w: c.width, h: c.height } : null,
          areaCl: overlap(a, b),
          areaLoc: overlap(a, c),
        };
      });
      notes.push(`${tag} lang-space ${JSON.stringify(langVs)}`);
      if (langVs.areaCl > 4) errors.push(`${tag}: ES toggle overlaps checklist ring`);
      if (langVs.areaLoc > 4) errors.push(`${tag}: ES toggle overlaps compass`);
    }

    await resetMap(page);
    const spawn = await page.evaluate(() => window.__playtestQa.jacSpawn?.());
    notes.push(`${tag} jac-spawn ${JSON.stringify(spawn)}`);
    if (!spawn) errors.push(`${tag}: jacSpawn missing`);
    else {
      if (spawn.origin.x !== 23 || spawn.origin.y !== 16) {
        errors.push(`${tag}: JAC origin ${spawn.origin.x},${spawn.origin.y} want 23,16`);
      }
      if (Math.abs(spawn.center.x - 25) > 0.1 || Math.abs(spawn.center.y - 17) > 0.1) {
        errors.push(`${tag}: JAC center ${spawn.center.x},${spawn.center.y} want 25,17`);
      }
    }

    const noahOv = await page.evaluate(() => {
      const n = window.__playtestQa.noah?.();
      if (!n) return { skip: true };
      window.__playtestQa.frameWorld(n.x, n.y, 1.05);
      return { skip: false, x: n.x, y: n.y };
    });
    await wait(250);
    const noahVs = await page.evaluate(() => {
      const pill = document.querySelector('.name-label[data-id="noah"]');
      const cl = document.querySelector('.checklist');
      const a = pill && !pill.hidden ? pill.getBoundingClientRect() : null;
      const b = cl && !cl.hidden ? cl.getBoundingClientRect() : null;
      const area = (p, q) => {
        if (!p || !q || p.width < 2 || q.width < 2) return 0;
        return (
          Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left)) *
          Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top))
        );
      };
      return { area: area(a, b), pillOn: !!a, cl: b ? { w: b.width, h: b.height } : null };
    });
    notes.push(`${tag} noah-vs-checklist ${JSON.stringify({ noahOv, noahVs })}`);
    if (!noahOv.skip && noahVs.area > 4) {
      errors.push(`${tag}: Noah pill overlaps Getting-started counter (${noahVs.area})`);
    }

    await resetMap(page);
    const parkedLeaks = await hiddenHitTargets(page);
    notes.push(`${tag} hidden-parked ${JSON.stringify(parkedLeaks)}`);
    if (parkedLeaks.length) errors.push(`${tag}: hidden overlays still laid out ${JSON.stringify(parkedLeaks)}`);

    await page.evaluate(() => window.__playtestQa.enterInterior('estudio'));
    await page.waitForFunction(() => window.__playtestQa.isInInterior() === true, null, { timeout: 8000 }).catch(() => {});
    await wait(400);
    const roomLeaks = await hiddenHitTargets(page);
    notes.push(`${tag} hidden-estudio ${JSON.stringify(roomLeaks)}`);
    if (roomLeaks.length) errors.push(`${tag}: hidden overlays in room ${JSON.stringify(roomLeaks)}`);
    const salirHit = await page.evaluate(() => {
      const btn = document.querySelector('.building-panel--open [data-exit]');
      const r = btn?.getBoundingClientRect();
      if (!r || r.width < 4) return { ok: false, reason: 'no-salir' };
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return {
        ok: !!top?.closest?.('[data-exit]'),
        x: Math.round(x),
        y: Math.round(y),
        hit: top?.className?.toString?.().slice(0, 80) ?? String(top?.tagName ?? ''),
        caseX: !!top?.closest?.('.case-read__x'),
        bar: !!top?.closest?.('.case-read__bar'),
        jac: !!top?.closest?.('.jac-hud'),
      };
    });
    notes.push(`${tag} salir-hit ${JSON.stringify(salirHit)}`);
    if (!salirHit.ok) errors.push(`${tag}: Salir tap hits ${salirHit.hit} not the exit button`);
    if (salirHit.caseX || salirHit.bar) errors.push(`${tag}: Salir covered by case-read overlay`);
    if (salirHit.jac) errors.push(`${tag}: Salir covered by JAC HUD`);
    await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
    await wait(200);

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

    const focusUrl = `${BASE}${BASE.includes('?') ? '&' : '?'}focus=jac`;
    await page.goto(focusUrl, { waitUntil: 'domcontentloaded' });
    await wait(500);
    const focused = await page.evaluate(() => {
      const jac = window.__playtestQa.jacEntities?.();
      const spawn = window.__playtestQa.jacSpawn?.();
      const pt = jac ? window.__playtestQa.worldToClient(jac.worldX, jac.worldY) : null;
      return {
        spawn,
        pt,
        vw: window.innerWidth,
        vh: window.innerHeight,
        onScreen: !!pt && pt.x > 8 && pt.x < window.innerWidth - 8 && pt.y > 8 && pt.y < window.innerHeight - 8,
      };
    });
    notes.push(`${tag} focus-jac ${JSON.stringify(focused)}`);
    if (!focused.onScreen) errors.push(`${tag}: ?focus=jac did not put the van on screen ${JSON.stringify(focused.pt)}`);
    await shot(page, tag, 'focus-jac');
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
