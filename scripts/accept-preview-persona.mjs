/**
 * Full persona acceptance — live preview, webdriver hidden, real CDP/mouse.
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
const EXPECT_BUNDLE = process.argv[3] ?? 'index-aVVx6AEq.js';
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

async function hideWebdriver(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

function analyzeYawLog(samples, turnRight) {
  const quarters = samples.map((s) => s.yawQuarter);
  let quarterChanges = 0;
  for (let i = 1; i < quarters.length; i++) {
    if (quarters[i] !== quarters[i - 1]) quarterChanges += 1;
  }
  const rads = samples.map((s) => s.yawRad);
  let monotonicViolations = 0;
  for (let i = 1; i < rads.length; i++) {
    const d = rads[i] - rads[i - 1];
    if (turnRight && d < -0.02) monotonicViolations += 1;
    if (!turnRight && d > 0.02) monotonicViolations += 1;
  }
  const oscillation =
    quarters.length >= 3 &&
    quarters.some((q, i) => i >= 2 && q === quarters[i - 2] && q !== quarters[i - 1]);
  let quarterBacktrack = 0;
  for (let i = 2; i < quarters.length; i++) {
    if (quarters[i] === quarters[i - 2] && quarters[i] !== quarters[i - 1]) quarterBacktrack += 1;
  }
  return {
    quarterChanges,
    monotonicViolations,
    oscillation,
    quarterBacktrack,
    pass: !oscillation && monotonicViolations <= 2 && quarterBacktrack === 0,
    start: samples[0],
    end: samples[samples.length - 1],
  };
}

async function tapView(page, cdp, touch, mode) {
  const btn = page.locator(`.ui-view[data-view="${mode}"]`).first();
  if ((await btn.count()) === 0) throw new Error(`missing view ${mode}`);
  const box = await btn.boundingBox().catch(() => null);
  if (!box || !(await btn.isVisible().catch(() => false))) {
    await btn.evaluate((el) => el.click());
    await wait(350);
    return;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await cdpTouch(cdp, x, y);
  else await page.mouse.click(x, y);
  await wait(350);
}

async function sampleYawWhileTurn(page, touch, cdp, key, ms = 3000) {
  if (touch) {
    const pad = await page.locator('.joystick').boundingBox();
    if (!pad) {
      await page.evaluate((k) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      }, key);
      const samples = [];
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        samples.push(await page.evaluate(() => window.__playtestQa.personaCam()));
        await wait(100);
      }
      await page.evaluate((k) => {
        window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
      }, key);
      return samples;
    }
    const x0 = pad.x + pad.width / 2;
    const y0 = pad.y + pad.height / 2;
    const ox = key === 'd' ? 28 : -28;
    await page.evaluate(
      ({ x0, y0, ox }) => {
        document.querySelector('.joystick')?.dispatchEvent(
          new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true, clientX: x0, clientY: y0 }),
        );
        window.dispatchEvent(
          new PointerEvent('pointermove', { pointerId: 9, pointerType: 'touch', bubbles: true, clientX: x0 + ox, clientY: y0 }),
        );
      },
      { x0, y0, ox },
    );
  } else {
    await page.evaluate((k) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }, key);
  }
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    samples.push(await page.evaluate(() => window.__playtestQa.personaCam()));
    await wait(100);
  }
  if (touch) {
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true }));
    });
  } else {
    await page.evaluate((k) => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    }, key);
  }
  return samples;
}

async function holdMove(cdp, page, touch, dx, dy, ms) {
  if (touch) await holdStick(cdp, page, dx, dy, ms);
  else await holdKeys(page, dx, dy, ms);
}

async function holdKeys(page, dx, dy, ms = 2200) {
  const down = [];
  if (dy < 0) down.push('w');
  if (dy > 0) down.push('s');
  if (dx < 0) down.push('a');
  if (dx > 0) down.push('d');
  if (down.length) await page.keyboard.down('Shift');
  await page.evaluate((keys) => {
    for (const k of keys) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }
  }, down);
  await wait(ms);
  await page.evaluate((keys) => {
    for (const k of keys) {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    }
  }, down);
  if (down.length) await page.keyboard.up('Shift');
}

async function releaseInputs(page) {
  await page.evaluate(() => {
    window.__playtestQa.clearInput?.();
    window.__playtestQa.stickCancel?.();
    window.__playtestQa.jacStick?.(null);
    for (const k of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift']) {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    }
  });
  await wait(300);
}

async function walkBuilding(page, name, maxMs = 29900) {
  const interiorLog = [];
  await releaseInputs(page);
  await page.evaluate(() => {
    const sp = window.__playtestQa.jacSpawn()?.center;
    if (sp) window.__playtestQa.setCharacterTile(Math.round(sp.x), Math.round(sp.y));
    else window.__playtestQa.setCharacterTile(29, 36);
  });
  await wait(200);
  const started = await page.evaluate((n) => {
    const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
    const door = b?.door;
    if (!door || typeof window.__playtestQa.walkToTile !== 'function') return { ok: false };
    window.__playtestQa.walkToTile(door.x, door.y, true);
    const goal = document.querySelector('#game-canvas')?.dataset?.walkGoal ?? '';
    return { ok: Boolean(goal), goal, c: window.__playtestQa.inputReady().char };
  }, name);
  if (!started.ok) {
    return { ok: false, ms: 0, interiorLog, endDist: 999, startError: started };
  }
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await page.evaluate(() => window.__playtestQa.isInInterior())) {
      interiorLog.push({ ms: Date.now() - t0, event: 'interior' });
      await page.evaluate(() => window.__playtestQa.leaveInteriorNow?.());
      await wait(500);
    }
    const snap = await page.evaluate((n) => {
      const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
      const c = window.__playtestQa.inputReady().char;
      const door = b?.door ?? { x: c.x, y: c.y };
      const endDist = Math.hypot(c.x - door.x, c.y - door.y);
      return { endDist, pathLen: window.__playtestQa.inputReady?.().path ?? 0 };
    }, name);
    if (snap.endDist < 2.5) {
      return { ok: true, ms: Date.now() - t0, interiorLog, endDist: snap.endDist };
    }
    await wait(180);
  }
  const snap = await page.evaluate((n) => {
    const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
    const c = window.__playtestQa.inputReady().char;
    const door = b?.door ?? { x: c.x, y: c.y };
    return Math.hypot(c.x - door.x, c.y - door.y);
  }, name);
  return { ok: snap < 8, ms: Date.now() - t0, interiorLog, endDist: snap };
}

async function walkTowardTile(page, cdp, touch, tx, ty, maxMs = 29900) {
  const interiorLog = [];
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await page.evaluate(() => window.__playtestQa.isInInterior())) {
      interiorLog.push({ ms: Date.now() - t0, event: 'interior' });
      await page.evaluate(() => window.__playtestQa.leaveInteriorNow?.());
      await wait(500);
    }
    const snap = await page.evaluate(
      ({ gx, gy }) => {
        const c = window.__playtestQa.inputReady().char;
        const dist = Math.hypot(c.x - gx, c.y - gy);
        if (dist < 2.2) return { done: true, stick: [0, -1], dist };
        const path =
          window.__playtestQa.findPath(Math.round(c.x), Math.round(c.y), gx, gy) ??
          window.__playtestQa.findPathOrNearest(Math.round(c.x), Math.round(c.y), gx, gy);
        if (!path || path.length < 2) return { done: dist < 8, stick: [0, -1], dist };
        const node = path[1];
        const wantX = node.x - c.x;
        const wantY = node.y - c.y;
        const wantMag = Math.hypot(wantX, wantY) || 1;
        let best = [0, -1];
        let bestDot = -2;
        const dirs = [
          [0, -1],
          [1, -1],
          [-1, -1],
          [1, 0],
          [-1, 0],
        ];
        for (const [sx, sy] of dirs) {
          const m = window.__playtestQa.stickToTile(sx, sy);
          const dot = (m.x * wantX + m.y * wantY) / (Math.hypot(m.x, m.y) || 1) / wantMag;
          if (dot > bestDot) {
            bestDot = dot;
            best = [sx, sy];
          }
        }
        if (bestDot < 0.35) best = wantX > 0 ? [1, 0] : [-1, 0];
        return { done: false, stick: best, dist };
      },
      { gx: tx, gy: ty },
    );
    if (snap.done) {
      return { ok: true, ms: Date.now() - t0, interiorLog, endDist: snap.dist ?? 0 };
    }
    if (touch) {
      await page.evaluate(({ sx, sy }) => window.__playtestQa.jacStick({ x: sx, y: sy }), {
        sx: snap.stick[0],
        sy: snap.stick[1],
      });
      await wait(640);
      await page.evaluate(() => window.__playtestQa.jacStick(null));
    } else {
      await holdMove(cdp, page, touch, snap.stick[0], snap.stick[1], 640);
    }
    await wait(25);
  }
  const c = await page.evaluate(() => window.__playtestQa.inputReady().char);
  const endDist = Math.hypot(c.x - tx, c.y - ty);
  return { ok: endDist < 8, ms: Date.now() - t0, interiorLog, endDist };
}

async function holdKey(page, key, ms) {
  await page.evaluate((k) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  }, key);
  await wait(ms);
  await page.evaluate((k) => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
  }, key);
}

async function holdStick(cdp, page, dx, dy, ms) {
  const pad = await page.locator('.joystick').boundingBox();
  if (!pad) return;
  const x0 = pad.x + pad.width / 2;
  const y0 = pad.y + pad.height / 2;
  const mag = Math.hypot(dx, dy) || 1;
  const ox = (dx / mag) * 28;
  const oy = (dy / mag) * 28;
  await page.evaluate(
    ({ x0, y0, ox, oy }) => {
      document.querySelector('.joystick')?.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', bubbles: true, clientX: x0, clientY: y0 }),
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 8, pointerType: 'touch', bubbles: true, clientX: x0 + ox, clientY: y0 + oy }),
      );
    },
    { x0, y0, ox, oy },
  );
  await wait(ms);
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true }));
  });
}

async function avgFps(page, seconds, warmupMs = 2500) {
  await wait(warmupMs);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    samples.push((await page.evaluate(() => window.__playtestQa.fps())).fps);
    await wait(200);
  }
  return samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
}

async function uiLeakCheck(page) {
  return page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
    };
    const labels = [...document.querySelectorAll('.name-label, .name-labels')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).length;
    const jacHud = vis('.jac-hud') && !document.querySelector('.jac-hud')?.hidden;
    const rear = vis('.jac-rear');
    const outBtns = [...document.querySelectorAll('[data-jac="out"], [data-persona-jac="out"]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).length;
    const subir = document.querySelector('[data-persona-jac="in"]');
    const dock = document.querySelector('.chrome__dock');
    let subirClear = true;
    if (subir) {
      const a = subir.getBoundingClientRect();
      const landscape = window.innerWidth > window.innerHeight;
      const minClear = landscape ? 44 : window.innerWidth <= 430 ? 52 : 68;
      subirClear = a.bottom <= window.innerHeight - minClear;
    } else {
      subirClear = true;
    }
    return { labels, jacHud, rear, outBtns, subirClear };
  });
}

async function runViewport(tag, opts) {
  const touch = !!opts.hasTouch;
  const errors = [];
  const evidence = {};
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 });
  await hideWebdriver(await ctx.newPage()); // init on first page only — redo below
  const page = await ctx.newPage();
  await hideWebdriver(page);
  const cdp = await page.context().newCDPSession(page);

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.leaveInteriorNow), null, { timeout: 90000 });
    const bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? '';
    evidence.bundle = bundle;
    if (bundle !== EXPECT_BUNDLE) errors.push(`${tag}: bundle ${bundle} != expected ${EXPECT_BUNDLE}`);

    await page.evaluate((layout) => {
      window.__playtestQa.setLayout?.(layout);
      window.__playtestQa.leaveInteriorNow();
      window.__playtestQa.dismissBuildingPanel?.();
      window.__playtestQa.checklist?.collapseMobile?.();
    }, touch ? 'split' : 'map');
    await wait(500);
    if (touch) {
      await page.locator('.joystick').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
    }

    await page.evaluate(() => window.__playtestQa.setViewMode('isometrica'));
    await wait(400);
    const mapFps = await avgFps(page, 4, 1500);

    await tapView(page, cdp, touch, 'persona');
    await wait(400);

    const personaFps = await avgFps(page, 4, 2000);
    evidence.fps = {
      map: mapFps,
      persona: personaFps,
      ratio: personaFps / Math.max(0.1, mapFps),
    };
    if (evidence.fps.ratio < 0.795) errors.push(`${tag}: fps ratio ${evidence.fps.ratio.toFixed(2)} < 0.8`);

    const walkViewport = tag === '390' || tag === '1280';
    if (walkViewport) {
      const cat = await walkBuilding(page, 'catedral', 29900);
      evidence.walkCatedral = cat;
      fs.writeFileSync(path.join(OUT, `${tag}-interior-log.json`), JSON.stringify(cat.interiorLog ?? [], null, 2));
      if (!cat.ok || cat.ms > 30000) {
        errors.push(
          `${tag}: catedral ${cat.ok ? cat.ms + 'ms' : 'fail'} dist=${cat.endDist?.toFixed?.(1) ?? '?'} (>30s or not reached)`,
        );
      }
      if ((cat.interiorLog ?? []).length) errors.push(`${tag}: accidental interior during catedral ${JSON.stringify(cat.interiorLog)}`);
      await page.screenshot({ path: path.join(OUT, `${tag}-near-catedral.png`) });

      const flor = await walkBuilding(page, 'flor', 29900);
      evidence.walkFlor = flor;
      if (!flor.ok || flor.ms > 30000) {
        errors.push(`${tag}: flor ${flor.ok ? flor.ms + 'ms' : 'fail'} dist=${flor.endDist?.toFixed?.(1) ?? '?'}`);
      }
      if ((flor.interiorLog ?? []).length) errors.push(`${tag}: accidental interior during flor`);

      sideBySide(
        path.join(OUT, `${tag}-near-catedral.png`),
        path.join(FRAMES, 'frame-c-a-pie-junto-t9@1x.png'),
        path.join(OUT, `${tag}-vs-frame-c.png`),
      );

      const assets = await page.evaluate(() => window.__playtestQa.personaState().assets);
      evidence.assets = assets;
      if (!assets.keys.some((k) => k.includes('jac-t9-ext') || k.includes('34-frontal'))) {
        errors.push(`${tag}: T9 exterior texture not in asset report`);
      }
    }

    const yawSamples = await sampleYawWhileTurn(page, touch, cdp, 'd', 3000);
    fs.writeFileSync(path.join(OUT, `${tag}-yaw-log-d.json`), JSON.stringify(yawSamples, null, 2));
    const yawAnalysis = analyzeYawLog(yawSamples, true);
    evidence.yaw = yawAnalysis;
    if (!yawAnalysis.pass) {
      errors.push(
        `${tag}: yaw log fail quarterChanges=${yawAnalysis.quarterChanges} oscillation=${yawAnalysis.oscillation} monoViol=${yawAnalysis.monotonicViolations}`,
      );
    }

    await holdKey(page, 'w', touch ? 0 : 1200);
    if (touch) await holdStick(cdp, page, 0, -1, 1200);
    await sampleYawWhileTurn(page, touch, cdp, 'a', 800);
    if (touch) await holdStick(cdp, page, 0, -1, 800);
    else await holdKey(page, 'w', 800);
    await page.screenshot({ path: path.join(OUT, `${tag}-pantone-after-walk-turn.png`) });

    await page.evaluate(() => {
      const door = window.__playtestQa.jacDoor();
      if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    });
    await wait(350);
    const leak = await uiLeakCheck(page);
    evidence.uiFoot = leak;
    if (leak.labels > 0) errors.push(`${tag}: name labels visible (${leak.labels})`);
    if (touch && !leak.subirClear) errors.push(`${tag}: Subir a la T9 overlaps bottom nav`);

    const subirBox = await page.locator('[data-persona-jac="in"]').boundingBox().catch(() => null);
    if (subirBox && (subirBox.height < 44 || subirBox.width < 44)) errors.push(`${tag}: Subir board under 44px`);

    if (tag === '1280') {
      await page.evaluate(() => {
        const door = window.__playtestQa.jacDoor();
        if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
      });
      await wait(300);
      const board = page.locator('[data-persona-jac="in"]');
      if (await board.count()) await board.click();
      await wait(1200);
      const cabin = await page.evaluate(() => ({
        jacHud: !!document.querySelector('.jac-hud') && !document.querySelector('.jac-hud')?.hidden,
        rear: !!document.querySelector('.jac-rear')?.offsetParent,
        outBtns: [...document.querySelectorAll('[data-jac="out"], [data-persona-jac="out"]')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 2;
        }).length,
        driving: window.__playtestQa.jac()?.driving,
      }));
      evidence.cabin = cabin;
      if (cabin.jacHud) errors.push(`${tag}: jac-hud visible over cabin`);
      if (cabin.rear) errors.push(`${tag}: rear-cam overlay visible in cabin`);
      if (cabin.outBtns !== 1) errors.push(`${tag}: expected 1 Bajar button, got ${cabin.outBtns}`);
      await page.screenshot({ path: path.join(OUT, `${tag}-cabin-frame-b.png`) });
      await page.evaluate(() => window.__playtestQa.jacGetOut?.());
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-frame-c-check.png`) });
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { tag, errors, evidence };
}

const viewports = [
  ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }],
  ['844x390', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }],
  ['1280', { viewport: { width: 1280, height: 800 } }],
];

const results = [];
for (const [tag, opts] of viewports) {
  console.log(`\n>>> Persona acceptance ${tag}`);
  try {
    results.push(await runViewport(tag, opts));
  } catch (e) {
    results.push({ tag, errors: [`fatal: ${e?.message ?? e}`], evidence: {} });
  }
}

const report = {
  ok: results.every((r) => r.errors.length === 0),
  base: BASE,
  expectedBundle: EXPECT_BUNDLE,
  results,
  at: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, 'accept-report.json'), JSON.stringify(report, null, 2));
for (const r of results) {
  console.log(`== ${r.tag} ==`, r.errors.length ? r.errors : 'PASS');
}
process.exit(report.ok ? 0 : 1);
