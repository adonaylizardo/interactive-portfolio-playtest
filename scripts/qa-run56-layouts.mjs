/**
 * Layouts v2: desktop split / map / panel toggle, and camera view switching.
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run56-layouts.mjs [url]` runs it alone.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser, dismissArrivalSheet } from './qa-ready.mjs';
import { ciContextOptions } from './qa-ci.mjs';

const soundBtn = () => '.chrome__rail [data-icon="sound"], .chrome__dock [data-icon="sound"]';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN56_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, desktop: true },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    desktop: false,
  },
};

/**
 * @param {{ kind: keyof typeof RUN56_KINDS, base: string, errors: string[], notes: string[] }} args
 */
export async function runRun56LayoutSuite({ kind, base, errors, notes }) {
  const spec = RUN56_KINDS[kind];
  const tag = `run56-${kind}`;
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext(ciContextOptions(spec.options));
  const page = await ctx.newPage();
  try {
    await page.goto(base, { waitUntil: 'load' });
    if (!spec.desktop) await dismissArrivalSheet(page);

    if (spec.desktop) {
      const load = await qa(page, () => {
        const col = document.querySelector('.chrome__column');
        const tab = document.querySelector('.chrome__tab');
        const canvas = document.getElementById('game-canvas');
        const cr = col?.getBoundingClientRect();
        return {
          layout: window.__playtestQa.getLayout(),
          body: document.body.dataset.layout,
          colShown: !!col && getComputedStyle(col).display !== 'none',
          colLeft: cr ? Math.round(cr.left) : null,
          colW: cr ? Math.round(cr.width) : null,
          tabShown: tab && getComputedStyle(tab).display !== 'none',
          canvasVis: getComputedStyle(canvas).visibility,
          view: canvas.dataset.viewMode,
          yaw: canvas.dataset.yaw,
          sy: canvas.dataset.viewSy,
        };
      });
      if (load.layout !== 'split' || load.body !== 'split') {
        errors.push(`${tag}: first load layout is ${load.layout}/${load.body}, want split`);
      }
      if (!load.colShown) errors.push(`${tag}: reading column hidden on split`);
      if (load.colLeft !== 64) errors.push(`${tag}: column left is ${load.colLeft}, want 64`);
      if (load.colW !== 432) errors.push(`${tag}: column width is ${load.colW}, want 432`);
      if (load.tabShown) errors.push(`${tag}: reopen tab visible on split`);
      if (load.canvasVis !== 'visible') errors.push(`${tag}: map hidden on split`);
      if (load.view !== 'isometrica') errors.push(`${tag}: default view is ${load.view}`);

      const passthrough = await qa(page, () => {
        const sound = document.querySelector('.chrome__sound');
        const sub = document.querySelector('.chrome__subtitle');
        const r = sound?.getBoundingClientRect();
        const at =
          r && r.width > 8
            ? document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
            : null;
        return {
          soundPe: sound ? getComputedStyle(sound).pointerEvents : 'missing',
          subPe: sub ? getComputedStyle(sub).pointerEvents : 'missing',
          hit: at ? at.id || at.className : 'none',
          canvas: !!at?.closest?.('#game-canvas') || at?.id === 'game-canvas',
        };
      });
      if (passthrough.soundPe !== 'none') {
        errors.push(`${tag}: sound note pointer-events is ${passthrough.soundPe}, want none`);
      }
      if (passthrough.subPe !== 'none') {
        errors.push(`${tag}: subtitle pointer-events is ${passthrough.subPe}, want none`);
      }
      if (passthrough.soundPe === 'none' && !passthrough.canvas) {
        errors.push(`${tag}: sound note still intercepts map taps (${passthrough.hit})`);
      }

      await qa(page, () => window.__playtestQa.setLayout('map'));
      await wait(200);
      const map = await qa(page, () => {
        const col = document.querySelector('.chrome__column');
        const tab = document.querySelector('.chrome__tab');
        const tr = tab.getBoundingClientRect();
        return {
          layout: window.__playtestQa.getLayout(),
          colShown: getComputedStyle(col).display !== 'none',
          tabShown: getComputedStyle(tab).display !== 'none',
          tabX: Math.round(tr.left),
          tabMid: Math.round(tr.top + tr.height / 2),
          h: innerHeight,
          canvasVis: getComputedStyle(document.getElementById('game-canvas')).visibility,
        };
      });
      if (map.layout !== 'map') errors.push(`${tag}: setLayout(map) left layout ${map.layout}`);
      if (map.colShown) errors.push(`${tag}: column still visible in map-only`);
      if (!map.tabShown) errors.push(`${tag}: reopen tab hidden in map-only`);
      if (map.tabX !== 0) errors.push(`${tag}: reopen tab left is ${map.tabX}, want 0`);
      if (Math.abs(map.tabMid - map.h / 2) > 24) {
        errors.push(`${tag}: reopen tab mid ${map.tabMid} is not vertically centred (${map.h / 2})`);
      }
      if (map.canvasVis !== 'visible') errors.push(`${tag}: map hidden in map-only`);

      await page.locator('.chrome__tab').click();
      await wait(200);
      const back = await qa(page, () => window.__playtestQa.getLayout());
      if (back !== 'split') errors.push(`${tag}: tab did not restore split (got ${back})`);

      await qa(page, () => window.__playtestQa.setLayout('panel'));
      await wait(200);
      const panel = await qa(page, () => ({
        layout: window.__playtestQa.getLayout(),
        canvasVis: getComputedStyle(document.getElementById('game-canvas')).visibility,
        colShown: getComputedStyle(document.querySelector('.chrome__column')).display !== 'none',
      }));
      if (panel.layout !== 'panel') errors.push(`${tag}: panel-only layout is ${panel.layout}`);
      if (panel.canvasVis !== 'hidden') errors.push(`${tag}: map still visible in panel-only`);
      if (!panel.colShown) errors.push(`${tag}: column hidden in panel-only`);

      await page.locator('[data-action="hide-panel"]').click();
      await wait(200);
      const hid = await qa(page, () => {
        const tab = document.querySelector('.chrome__tab');
        const tr = tab.getBoundingClientRect();
        return {
          layout: window.__playtestQa.getLayout(),
          body: document.body.dataset.layout,
          tabShown: getComputedStyle(tab).display !== 'none',
          tabX: Math.round(tr.left),
          canvasVis: getComputedStyle(document.getElementById('game-canvas')).visibility,
        };
      });
      if (hid.layout !== 'map' || hid.body !== 'map') {
        errors.push(`${tag}: Hide panel in panel-only left layout ${hid.layout}/${hid.body}, want map`);
      }
      if (!hid.tabShown) errors.push(`${tag}: map tab hidden after Hide panel`);
      if (hid.tabX !== 0) errors.push(`${tag}: map tab left is ${hid.tabX} after Hide panel, want 0`);
      if (hid.canvasVis !== 'visible') errors.push(`${tag}: map still hidden after Hide panel`);

      await qa(page, () => window.__playtestQa.setLayout('split'));
      await wait(200);

      const before = await qa(page, () => {
        const t = window.__playtestQa.getCharacterTile();
        const foot = window.__playtestQa.worldToClient((t.x - t.y) * 64, (t.x + t.y) * 32);
        const d = document.getElementById('game-canvas').dataset;
        return { foot, sy: d.viewSy, rot: d.viewRot, mode: d.viewMode, yaw: d.yaw };
      });
      await qa(page, () => window.__playtestQa.setViewMode('cenital'));
      await wait(200);
      const cen = await qa(page, () => {
        const t = window.__playtestQa.getCharacterTile();
        const foot = window.__playtestQa.worldToClient((t.x - t.y) * 64, (t.x + t.y) * 32);
        const d = document.getElementById('game-canvas').dataset;
        const active = document.querySelector('.ui-view[data-view="cenital"]')?.classList.contains('is-active');
        return { foot, sy: Number(d.viewSy), rot: Number(d.viewRot), mode: d.viewMode, active };
      });
      if (cen.mode !== 'cenital') errors.push(`${tag}: cenital dataset is ${cen.mode}`);
      if (Math.abs(cen.sy - 2) > 0.01) errors.push(`${tag}: cenital scaleY is ${cen.sy}, want 2`);
      if (Math.abs(cen.rot - Math.PI / 4) > 0.05) errors.push(`${tag}: cenital rot is ${cen.rot}, want π/4`);
      if (!cen.active) errors.push(`${tag}: cenital button is not active`);
      const moved = Math.hypot(cen.foot.x - before.foot.x, cen.foot.y - before.foot.y);
      if (moved < 4) errors.push(`${tag}: cenital did not move the character on screen (d=${moved.toFixed(1)})`);

      await qa(page, () => window.__playtestQa.setViewMode('perspectiva'));
      await wait(200);
      const persp = await qa(page, () => {
        const d = document.getElementById('game-canvas').dataset;
        return { mode: d.viewMode, sy: Number(d.viewSy) };
      });
      if (persp.mode !== 'perspectiva') errors.push(`${tag}: perspectiva dataset is ${persp.mode}`);
      if (Math.abs(persp.sy - 1) > 0.01) errors.push(`${tag}: perspectiva scaleY is ${persp.sy}, want 1`);

      await qa(page, () => window.__playtestQa.setViewMode('isometrica'));
      await qa(page, () => window.__playtestQa.rotateView());
      await wait(200);
      const rot = await qa(page, () => {
        const d = document.getElementById('game-canvas').dataset;
        return { yaw: Number(d.yaw), rot: Number(d.viewRot), mode: d.viewMode };
      });
      if (rot.yaw !== 1) errors.push(`${tag}: rotate yaw is ${rot.yaw}, want 1`);
      if (Math.abs(rot.rot - Math.PI / 2) > 0.05) errors.push(`${tag}: rotate rot is ${rot.rot}, want π/2`);

      await page.locator('.ui-view[data-view="cenital"]').click();
      await wait(200);
      const clicked = await qa(page, () => document.getElementById('game-canvas').dataset.viewMode);
      if (clicked !== 'cenital') errors.push(`${tag}: clicking cenital button left view ${clicked}`);

      await qa(page, () => {
        localStorage.removeItem('studio-audio-muted');
        window.__playtestQa.setAudioMuted(false);
      });
      const sound0 = await qa(page, () => {
        const btn = document.querySelector('[data-icon="sound"]');
        return {
          muted: window.__playtestQa.audioMuted(),
          pressed: btn?.getAttribute('aria-pressed'),
          stored: localStorage.getItem('studio-audio-muted'),
        };
      });
      if (sound0.muted) errors.push(`${tag}: sound starts muted`);
      if (sound0.pressed !== 'true') errors.push(`${tag}: sound aria-pressed is ${sound0.pressed}, want true`);
      await page.locator(soundBtn()).first().click();
      await page.waitForFunction(
        () => window.__playtestQa.audioMuted() && window.__playtestQa.audioUnlocked(),
        null,
        { timeout: 15000 },
      );
      const sound1 = await qa(page, () => ({
        muted: window.__playtestQa.audioMuted(),
        pressed: document.querySelector('[data-icon="sound"]')?.getAttribute('aria-pressed'),
        stored: localStorage.getItem('studio-audio-muted'),
        unlocked: window.__playtestQa.audioUnlocked(),
      }));
      if (!sound1.muted) errors.push(`${tag}: sound click did not mute`);
      if (sound1.pressed !== 'false') errors.push(`${tag}: muted sound aria-pressed is ${sound1.pressed}, want false`);
      if (sound1.stored !== '1') errors.push(`${tag}: mute did not persist to localStorage (got ${sound1.stored})`);
      if (!sound1.unlocked) errors.push(`${tag}: first sound click did not unlock audio`);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
      const sound2 = await qa(page, () => ({
        muted: window.__playtestQa.audioMuted(),
        stored: localStorage.getItem('studio-audio-muted'),
        pressed: document.querySelector('[data-icon="sound"]')?.getAttribute('aria-pressed'),
      }));
      if (!sound2.muted || sound2.stored !== '1') {
        errors.push(`${tag}: mute did not survive reload (muted=${sound2.muted} stored=${sound2.stored})`);
      }
      if (sound2.pressed !== 'false') errors.push(`${tag}: reloaded sound aria-pressed is ${sound2.pressed}, want false`);
      await page.locator(soundBtn()).first().click();
      await page.waitForFunction(() => !window.__playtestQa.audioMuted(), null, { timeout: 15000 });
      const sound3 = await qa(page, () => window.__playtestQa.audioMuted());
      if (sound3) errors.push(`${tag}: second sound click did not unmute`);
      await qa(page, () => {
        localStorage.removeItem('studio-audio-muted');
        window.__playtestQa.setAudioMuted(false);
      });

      notes.push(
        `${tag}: split ${load.colW}px@${load.colLeft}, map tab x=${map.tabX} mid=${map.tabMid}, ` +
          `panel Hide panel → map tab x=${hid.tabX}, mute persists, views iso→cenital sy=${cen.sy} d=${moved.toFixed(0)}px → persp ${persp.sy} → yaw ${rot.yaw}`,
      );
    } else {
      const m1 = await qa(page, () => {
        const intro = document.querySelector('.chrome__intro');
        const dock = document.querySelector('.chrome__dock');
        const views = document.querySelector('.chrome__views');
        return {
          sheet: document.body.classList.contains?.('x') || document.body.dataset.layout,
          introShown: getComputedStyle(intro).display !== 'none',
          dockShown: getComputedStyle(dock).display !== 'none',
          viewsShown: getComputedStyle(views).display !== 'none',
        };
      });
      if (!m1.introShown) errors.push(`${tag}: arrival intro sheet is hidden`);
      if (m1.dockShown) errors.push(`${tag}: dock visible on arrival`);
      if (m1.viewsShown) errors.push(`${tag}: view buttons visible under the intro sheet`);

      await page.locator('.chrome__intro-close').tap();
      await wait(300);
      const m4 = await qa(page, () => {
        const intro = document.querySelector('.chrome__intro');
        const dock = document.querySelector('.chrome__dock');
        const views = document.querySelector('.chrome__views');
        const btns = [...document.querySelectorAll('.chrome__view-btns .ui-view')].map((b) => ({
          view: b.getAttribute('data-view'),
          shown: getComputedStyle(b).display !== 'none',
        }));
        return {
          layout: document.body.dataset.layout,
          introShown: getComputedStyle(intro).display !== 'none',
          dockShown: getComputedStyle(dock).display !== 'none',
          viewsShown: getComputedStyle(views).display !== 'none',
          btns,
        };
      });
      if (m4.layout !== 'map') errors.push(`${tag}: closing the sheet left layout ${m4.layout}`);
      if (m4.introShown) errors.push(`${tag}: intro still open after close`);
      if (!m4.dockShown) errors.push(`${tag}: dock hidden after closing the sheet`);
      if (!m4.viewsShown) errors.push(`${tag}: camera buttons hidden on the closed-sheet map`);
      const shown = m4.btns.filter((b) => b.shown).map((b) => b.view);
      if (shown.join() !== 'isometrica,cenital,map') {
        errors.push(`${tag}: M4 view buttons are ${shown.join(',')}, want iso, cenital, map`);
      }

      await page.locator('.ui-view[data-view="cenital"]').tap();
      await wait(200);
      const view = await qa(page, () => document.getElementById('game-canvas').dataset.viewMode);
      if (view !== 'cenital') errors.push(`${tag}: tapping cenital left view ${view}`);

      notes.push(`${tag}: M1 intro, M4 dock + 3 camera buttons, cenital tap → ${view}`);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base =
    process.argv.find((a) => /^https?:/.test(a)) ??
    'http://127.0.0.1:4173/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN56_KINDS)) await runRun56LayoutSuite({ kind, base, errors, notes });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
void ROOT;
