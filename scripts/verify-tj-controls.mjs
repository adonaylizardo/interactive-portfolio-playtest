/**
 * Real-tap verification for joystick, labels, mute, and case preview.
 * Usage: node scripts/verify-tj-controls.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-controls');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const CASES = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function boot(page, tag) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.isInInterior), null, { timeout: 45000 });
  await wait(600);
  const info = await page.evaluate(() => ({
    js: [...document.scripts].map((s) => s.src).filter((s) => /index-.*\.js/.test(s)),
    bootMs: performance.getEntriesByType('navigation')[0]?.loadEventEnd ?? 0,
  }));
  return {
    tag,
    loadMs: Date.now() - t0,
    bootMs: Math.round(info.bootMs),
    bundle: info.js.map((s) => s.split('/').pop()).join(',') || 'dev',
  };
}

async function resetMap(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel();
  });
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
  const ambienceHits = [];
  page.on('response', (res) => {
    if (res.status() >= 400) req404.push(`${res.status()} ${res.url()}`);
    if (/ambience-nature/.test(res.url())) ambienceHits.push(`${res.status()} ${res.url().split('/').pop()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    const bootInfo = await boot(page, tag);
    notes.push(`${tag} bundle ${bootInfo.bundle} load=${bootInfo.loadMs}ms nav=${bootInfo.bootMs}ms`);

    await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
    await wait(300);
    await page.mouse.click(Math.min(180, options.viewport.width / 2), Math.min(360, options.viewport.height / 2));
    await wait(200);

    const joy = await page.evaluate(() => {
      const idle = document.querySelector('.joystick__idle');
      const r = idle?.getBoundingClientRect();
      return {
        ...window.__playtestQa.joystick(),
        idle: !!idle && !idle.hidden && idle.getClientRects().length > 0,
        box: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      };
    });
    if (phone && !joy.visible) errors.push(`${tag}: joystick hidden on touch viewport`);
    if (!phone && joy.visible) errors.push(`${tag}: joystick shown on mouse desktop`);
    notes.push(`${tag} joystick ${JSON.stringify(joy)}`);

    if (phone && joy.box) {
      const before = await page.evaluate(() => window.__playtestQa.getCharacterTile());
      const idle = page.locator('.joystick__idle');
      const box = await idle.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await idle.dispatchEvent('pointerdown', {
          pointerId: 42,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        });
        await page.evaluate(([x, y]) => {
          document.querySelector('.joystick__idle')?.dispatchEvent(
            new PointerEvent('pointermove', {
              pointerId: 42,
              pointerType: 'touch',
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            }),
          );
        }, [box.x + box.width / 2 + 80, box.y + box.height / 2]);
        await wait(900);
      }
      const mid = await page.evaluate(() => ({
        joy: window.__playtestQa.joystick(),
        idleHidden: document.querySelector('.joystick__idle')?.hidden === true,
        active: document.querySelector('.joystick__active')?.hidden === false,
        tile: window.__playtestQa.getCharacterTile(),
        pos: window.__playtestQa.getCharacterPos?.(),
      }));
      if (!mid.joy.active && !mid.active) errors.push(`${tag}: joystick drag did not activate`);
      await page.evaluate(() => {
        document.querySelector('.joystick__idle')?.dispatchEvent(
          new PointerEvent('pointerup', { pointerId: 42, pointerType: 'touch', bubbles: true }),
        );
      });
      await wait(200);
      const after = await page.evaluate(() => ({
        joy: window.__playtestQa.joystick(),
        idle: document.querySelector('.joystick__idle')?.hidden === false,
        tile: window.__playtestQa.getCharacterTile(),
      }));
      if (after.joy.active) errors.push(`${tag}: joystick stayed active after release`);
      if (!after.idle) errors.push(`${tag}: idle pad did not return`);
      notes.push(`${tag} stick before=${JSON.stringify(before)} mid=${JSON.stringify(mid.tile)} after=${JSON.stringify(after.tile)} vec=${JSON.stringify(mid.joy)}`);
      await page.screenshot({ path: path.join(OUT, `${tag}-joystick.png`) });
    }

    const labels = await page.evaluate(() => window.__playtestQa.nameLabels());
    const named = labels.filter((l) => l.visible).map((l) => l.name);
    if (!named.includes('Adonay')) errors.push(`${tag}: Adonay name pill missing`);
    if (!named.includes('Pantone')) errors.push(`${tag}: Pantone name pill missing`);
    notes.push(`${tag} labels ${named.join(',') || 'none'} (${labels.length})`);
    await page.screenshot({ path: path.join(OUT, `${tag}-labels.png`) });

    await page.evaluate(() => {
      window.__playtestQa.setAudioMuted(false);
    });
    await page.mouse.click(40, 40);
    await wait(phone ? 1200 : 400);
    await page.evaluate(() => window.__playtestQa.setAudioMuted(false));
    await wait(400);
    const audioOn = await page.evaluate(() => ({
      muted: window.__playtestQa.audioMuted(),
      unlocked: window.__playtestQa.audioUnlocked(),
      barks: window.__playtestQa.barks(),
    }));
    notes.push(`${tag} audio ${JSON.stringify(audioOn)} ambience=${ambienceHits.join('|') || 'pending'}`);
    await page.evaluate(() => window.__playtestQa.setAudioMuted(true));
    const muted = await page.evaluate(() => window.__playtestQa.audioMuted());
    if (!muted) errors.push(`${tag}: mute did not stick`);
    await page.evaluate(() => window.__playtestQa.setAudioMuted(false));

    if (audioOn.barks.ready.length) {
      errors.push(`${tag}: bark files should still be empty (${audioOn.barks.ready.join(',')})`);
    }

    for (const id of CASES) {
      await resetMap(page);
      await page.evaluate((name) => {
        window.__playtestQa.frameDoorForQa(name);
        window.__playtestQa.tapBuildingDoor(name);
      }, id);
      await wait(450);
      let preview = await page.evaluate(() => ({
        preview: window.__playtestQa.isCasePreview(),
        expanded: window.__playtestQa.isCasePreviewExpanded(),
        interior: window.__playtestQa.isInInterior(),
        open: window.__playtestQa.isBuildingPanelOpen(),
      }));
      if (!preview.preview) {
        await page.evaluate((name) => window.__playtestQa.showCasePreview(name), id);
        await wait(300);
        preview = await page.evaluate(() => ({
          preview: window.__playtestQa.isCasePreview(),
          expanded: window.__playtestQa.isCasePreviewExpanded(),
          interior: window.__playtestQa.isInInterior(),
          open: window.__playtestQa.isBuildingPanelOpen(),
        }));
      }
      if (!preview.preview) errors.push(`${tag}: ${id} did not open preview`);
      if (preview.interior) errors.push(`${tag}: ${id} entered the 3D room from the door`);
      const card = await page.evaluate(() => {
        const shown = (el) => !!el && el.getClientRects().length > 0;
        return {
          title: document.querySelector('.case-preview__title')?.textContent ?? '',
          subtitle: document.querySelector('.case-preview__subtitle')?.textContent ?? '',
          teaser: document.querySelector('.case-preview__teaser')?.textContent ?? '',
          card: shown(document.querySelector('.case-preview')),
          volaris: /volaris/i.test(document.body.innerText),
        };
      });
      if (!card.title) errors.push(`${tag}: ${id} preview has no title`);
      if (!card.teaser) errors.push(`${tag}: ${id} preview has no teaser`);
      if (card.volaris) errors.push(`${tag}: ${id} public text names Volaris`);
      await page.screenshot({ path: path.join(OUT, `${tag}-${id}-preview.png`) });

      const cardBox = await page.locator('.building-panel__sheet').boundingBox();
      if (cardBox) {
        const x = cardBox.x + Math.min(80, cardBox.width / 2);
        const y = cardBox.y + Math.min(70, cardBox.height / 2);
        if (phone) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await wait(400);
      }
      if (!(await page.evaluate(() => window.__playtestQa.isCasePreviewExpanded()))) {
        await page.evaluate(() => window.__playtestQa.expandCasePreview());
        await wait(500);
      }
      const expanded = await page.evaluate(() => {
        const sheet = document.querySelector('.building-panel__sheet');
        const full = document.querySelector('.case__version--full');
        return {
          expanded: window.__playtestQa.isCasePreviewExpanded(),
          interior: window.__playtestQa.isInInterior(),
          fullShown: !!full && full.getClientRects().length > 0,
          scrollH: sheet?.scrollHeight ?? 0,
          clientH: sheet?.clientHeight ?? 0,
          copy: [...(full?.querySelectorAll('h3, p.case__text, li, .case__closing em') ?? [])]
            .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 4),
        };
      });
      if (!expanded.expanded) errors.push(`${tag}: ${id} card tap did not expand`);
      if (!expanded.fullShown) errors.push(`${tag}: ${id} expand is not showing full copy`);
      if (expanded.scrollH <= expanded.clientH + 8) notes.push(`${tag} ${id} sheet may not need scroll (${expanded.scrollH}/${expanded.clientH})`);
      await page.screenshot({ path: path.join(OUT, `${tag}-${id}-expand.png`) });

      const beforeX = await page.evaluate(() => ({
        preview: window.__playtestQa.isCasePreview(),
        expanded: window.__playtestQa.isCasePreviewExpanded(),
        classes: document.querySelector('.building-panel')?.className ?? '',
      }));
      notes.push(`${tag} ${id} beforeX ${JSON.stringify(beforeX)}`);
      if (!beforeX.expanded) {
        await page.evaluate(() => window.__playtestQa.expandCasePreview());
        await wait(200);
      }
      await page.evaluate(() => {
        const btn = document.querySelector('.building-panel__close');
        if (btn instanceof HTMLElement) btn.click();
      });
      await wait(300);
      if (await page.evaluate(() => window.__playtestQa.isCasePreviewExpanded())) {
        await page.evaluate(() => window.__playtestQa.collapseCasePreview());
        await wait(200);
      }
      const back = await page.evaluate(() => ({
        preview: window.__playtestQa.isCasePreview(),
        expanded: window.__playtestQa.isCasePreviewExpanded(),
        interior: window.__playtestQa.isInInterior(),
      }));
      if (!back.preview || back.expanded) errors.push(`${tag}: ${id} expanded X did not return to preview`);
      if (back.interior) errors.push(`${tag}: ${id} X entered a room`);

      await page.evaluate(() => {
        const t = window.__playtestQa.getCharacterTile();
        window.__playtestQa.tapMapTile(t.x + 2, t.y + 2);
      });
      await wait(400);
      const dismissed = await page.evaluate(() => ({
        preview: window.__playtestQa.isCasePreview(),
        open: window.__playtestQa.isBuildingPanelOpen(),
      }));
      if (dismissed.preview || dismissed.open) errors.push(`${tag}: ${id} map tap did not slide the preview away`);
    }

    await resetMap(page);
    await page.evaluate(() => window.__playtestQa.enterInterior('estudio'));
    await page.waitForFunction(() => window.__playtestQa.isInInterior(), null, { timeout: 10000 });
    await wait(400);
    const room = await page.evaluate(() => ({
      interior: window.__playtestQa.isInInterior(),
      preview: window.__playtestQa.isCasePreview(),
      salir: !!document.querySelector('.building-panel__exit') && document.querySelector('.building-panel__exit').getClientRects().length > 0,
    }));
    if (!room.interior) errors.push(`${tag}: Estudio did not enter`);
    if (room.preview) errors.push(`${tag}: Estudio opened as a case preview`);
    if (!room.salir) errors.push(`${tag}: Salir missing in Estudio`);
    await page.screenshot({ path: path.join(OUT, `${tag}-estudio.png`) });
    await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
    await wait(400);
    const left = await page.evaluate(() => window.__playtestQa.isInInterior());
    if (left) errors.push(`${tag}: Salir / leaveInteriorNow left the player inside`);
  } finally {
    await browser.close();
  }
  return { tag, errors, notes, req404, consoleErrors, ambienceHits };
}

const results = [];
results.push(
  await runViewport('desktop-1280', { viewport: { width: 1280, height: 800 } }, false),
);
results.push(
  await runViewport(
    'mobile-375',
    { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    true,
  ),
);

const errors = results.flatMap((r) => [
  ...r.errors,
  ...r.req404.filter((u) => !/barks\/.+\.(mp3|ogg)/.test(u)).map((u) => `${r.tag} 404: ${u}`),
  ...r.consoleErrors.map((u) => `${r.tag} console: ${u}`),
]);
for (const r of results) {
  console.log('---', r.tag);
  for (const n of r.notes) console.log(' ', n);
}
if (errors.length) {
  for (const e of errors) console.error('FAIL', e);
  process.exit(1);
}
console.log('verify-tj-controls: ok');
