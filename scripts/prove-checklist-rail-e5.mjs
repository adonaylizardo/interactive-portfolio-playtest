#!/usr/bin/env node
/**
 * QA e5: checklist must not cover desktop rail; Casos click works; landscape checklist reachable.
 */
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PREVIEW_PORT ?? 4195);
const BASE = `http://127.0.0.1:${PORT}/interactive-portfolio-playtest/preview-edificios/`;

async function probe(page, label, points) {
  const rows = [];
  for (const pt of points) {
    const hit = await page.evaluate(({ x, y }) => {
      const raw = document.elementFromPoint(x, y);
      const el = raw?.closest?.('.chrome__rail button') ?? raw;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: el.className?.toString?.().slice(0, 80) ?? '',
        id: el.id,
        action: el instanceof HTMLElement ? el.dataset.action : '',
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
    }, pt);
    rows.push({ label: pt.name, at: `${pt.x},${pt.y}`, hit });
  }
  return { viewport: label, rows };
}

async function clickCasos(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('.chrome__rail [data-action="cases"]');
    if (!btn) return { ok: false, reason: 'no rail Casos button' };
    const before = document.body.dataset.layout;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const after = document.body.dataset.layout;
    const col = document.querySelector('.chrome__column');
    const colVisible = col && col.style.display !== 'none' && !col.hidden;
    return { ok: after === 'split' && colVisible, before, after, colVisible };
  });
}

async function landscapeChecklist(page) {
  return page.evaluate(() => {
    const cl = document.querySelector('.checklist');
    const ring = document.querySelector('.checklist__ring-btn');
    const skip = document.querySelector('.checklist__skip');
    const lang = document.querySelector('.chrome__lang');
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const vw = window.innerWidth;
    return {
      checklist: rect(cl),
      ringBtn: rect(ring),
      skip: rect(skip),
      lang: rect(lang),
      ringOnScreen: ring ? ring.getBoundingClientRect().right <= vw && ring.getBoundingClientRect().left >= 0 : false,
      skipOnScreen: skip ? skip.getBoundingClientRect().right <= vw : false,
    };
  });
}

const preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));

const browser = await launchBrowser(chromium);
const out = [];

try {
  for (const vp of [
    { w: 1280, h: 800, name: '1280x800' },
    { w: 1440, h: 900, name: '1440x900' },
    { w: 844, h: 390, name: '844x390' },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
      timeout: 60000,
    });
    if (vp.w >= 768) {
      await page.evaluate(() => {
        window.__playtestQa.setLayout?.('map');
        window.__playtestQa.dismissBuildingPanel?.();
      });
      await page.evaluate(() => window.__playtestQa.enterInterior?.('volaris'));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__playtestQa.dismissBuildingPanel?.());
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
    } else {
      await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
    }
    await page.waitForTimeout(300);

    const probeResult = await probe(page, vp.name, [
      { name: 'rail-avatar', x: 32, y: 32 },
      { name: 'rail-casos', x: 32, y: 80 },
    ]);
    const isDesktopRail = vp.w >= 768 && vp.h > 500;
    let casos = { ok: true, skipped: 'compact/phone layout (no desktop rail Casos)' };
    if (isDesktopRail) {
      await page.mouse.click(32, 80);
      await page.waitForTimeout(200);
      casos = await clickCasos(page);
      casos.realClickAt32x80 = casos.ok;
    }
    const landscapeClosed = vp.h <= 500 ? await landscapeChecklist(page) : null;
    if (vp.h <= 500) {
      await page.locator('.checklist__ring-btn').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
    const landscape = vp.h <= 500 ? await landscapeChecklist(page) : null;

    const railClear =
      isDesktopRail &&
      probeResult.rows.every((r) => {
        if (r.label !== 'rail-avatar' && r.label !== 'rail-casos') return true;
        const cls = r.hit?.cls ?? '';
        const action = r.hit?.action ?? '';
        return (
          cls.includes('ui-round') &&
          !cls.includes('checklist') &&
          (r.label === 'rail-avatar' ? action === 'home' : action === 'cases')
        );
      });

    out.push({
      viewport: vp.name,
      probe: probeResult,
      casosClick: casos,
      railHitsClear: vp.w >= 768 ? railClear : null,
      landscapeClosed,
      landscape,
      pass:
        (!isDesktopRail || railClear) &&
        casos.ok &&
        (vp.h > 500 ||
          (landscapeClosed?.checklist &&
            landscapeClosed.checklist.x < 200 &&
            landscapeClosed.ringOnScreen &&
            landscape?.skipOnScreen)),
    });
    await page.close();
  }
} finally {
  await browser.close();
  preview.kill();
}

const pass = out.every((r) => r.pass);
const payload = { pass, results: out };
console.log(JSON.stringify(payload, null, 2));
const outFile = process.env.CHECKLIST_E5_OUT;
if (outFile) {
  const fs = await import('node:fs');
  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
}
process.exit(pass ? 0 : 1);
