#!/usr/bin/env node
/**
 * QA e6: top chrome controls must not be covered by checklist; lang toggle works.
 */
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://127.0.0.1:${Number(process.env.PREVIEW_PORT ?? 4195)}/interactive-portfolio-playtest/preview-edificios/`;

async function hitAt(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const raw = document.elementFromPoint(x, y);
    if (!raw) return null;
    const railBtn = raw.closest?.('.chrome__rail button');
    const langBtn = raw.closest?.('.chrome__lang-opt');
    const soundBtn = raw.closest?.('.chrome__sound');
    const el = railBtn ?? langBtn ?? soundBtn ?? raw;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      cls: el.className?.toString?.().slice(0, 96) ?? '',
      action: el instanceof HTMLElement ? el.dataset.action ?? el.dataset.lang ?? '' : '',
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    };
  }, { x, y });
}

async function langCenters(page) {
  return page.evaluate(() => {
    const out = {};
    for (const btn of document.querySelectorAll('.chrome__lang-opt')) {
      const r = btn.getBoundingClientRect();
      out[btn.dataset.lang] = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return out;
  });
}

async function prepDesktopMap(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.collapseChecklistForQa?.();
  });
  await page.evaluate(() => window.__playtestQa.prepareDoorEntryForQa?.('volaris'));
  const pt = await page.evaluate(() => window.__playtestQa.doorScreenPoint('volaris'));
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__playtestQa.dismissBuildingPanel?.());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.collapseChecklistForQa?.();
  });
  await page.waitForTimeout(200);
}

let preview = null;
if (process.env.PREVIEW_EXTERNAL !== '1') {
  preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 4000));
}

const browser = await launchBrowser(chromium);
const results = [];

try {
  for (const vp of [
    { w: 1280, h: 800, name: '1280x800' },
    { w: 1440, h: 900, name: '1440x900' },
    { w: 390, h: 844, name: '390x844' },
    { w: 844, h: 390, name: '844x390' },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
      timeout: 90000,
    });

    const isDesktopRail = vp.w >= 768 && vp.h > 500;
    const probes = [];

    if (isDesktopRail) {
      await prepDesktopMap(page);
      probes.push(
        { name: 'rail-avatar', x: 32, y: 32, wantAction: 'home', forbid: 'checklist' },
        { name: 'rail-casos', x: 32, y: 80, wantAction: 'cases', forbid: 'checklist' },
      );
      const lang = await langCenters(page);
      if (lang.en) probes.push({ name: 'lang-en', ...lang.en, wantAction: 'en', forbid: 'checklist' });
      if (lang.es) probes.push({ name: 'lang-es', ...lang.es, wantAction: 'es', forbid: 'checklist' });
    } else if (vp.h <= 500) {
      await page.evaluate(() => {
        window.__playtestQa.setLayout?.('map');
        window.__playtestQa.collapseChecklistForQa?.();
      });
      await page.waitForTimeout(200);
      const lang = await langCenters(page);
      if (lang.en) probes.push({ name: 'lang-en', ...lang.en, wantAction: 'en', forbid: 'checklist' });
    } else {
      await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
    }

    const rows = [];
    for (const p of probes) {
      const hit = await hitAt(page, p.x, p.y);
      rows.push({ label: p.name, at: `${Math.round(p.x)},${Math.round(p.y)}`, hit });
    }

    let langClick = { skipped: true };
    if (isDesktopRail) {
      const lang = await langCenters(page);
      if (lang.en) {
        const before = await page.evaluate(() => document.documentElement.lang);
        await page.mouse.click(lang.en.x, lang.en.y);
        await page.waitForTimeout(150);
        const after = await page.evaluate(() => document.documentElement.lang);
        const active = await page.evaluate(
          () => document.querySelector('.chrome__lang-opt[data-lang="en"]')?.classList.contains('is-active'),
        );
        langClick = { ok: after.startsWith('en') && active, before, after };
      }
    }

    let casosClick = { skipped: !isDesktopRail };
    if (isDesktopRail) {
      const layoutBefore = await page.evaluate(() => document.body.dataset.layout);
      await page.mouse.click(32, 80);
      await page.waitForTimeout(200);
      const layoutAfter = await page.evaluate(() => document.body.dataset.layout);
      casosClick = {
        ok: layoutBefore === 'map' && layoutAfter === 'split',
        before: layoutBefore,
        after: layoutAfter,
      };
    }

    const hitsOk = probes.every((p) => {
      const row = rows.find((r) => r.label === p.name);
      const hit = row?.hit;
      if (!hit) return false;
      if (p.forbid && hit.cls.includes(p.forbid)) return false;
      if (p.wantAction && hit.action !== p.wantAction) return false;
      return true;
    });

    let checklistClosedBox = null;
    if (vp.h <= 500) {
      checklistClosedBox = await page.evaluate(() => {
        const el = document.querySelector('.checklist');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const list = el.querySelector('.checklist__list');
        return {
          w: r.width,
          h: r.height,
          cls: el.className,
          listDisplay: list ? getComputedStyle(list).display : null,
        };
      });
    }

    results.push({
      viewport: vp.name,
      probes: rows,
      langClick,
      casosClick,
      checklistClosedBox,
      pass:
        (!probes.length || hitsOk) &&
        (langClick.skipped || langClick.ok) &&
        (casosClick.skipped || casosClick.ok) &&
        (vp.h > 500 || (checklistClosedBox?.listDisplay === 'none' && checklistClosedBox?.h <= 56)),
    });
    await page.close();
  }
} finally {
  await browser.close();
  preview?.kill();
}

const pass = results.every((r) => r.pass !== false);
const payload = { pass, results };
console.log(JSON.stringify(payload, null, 2));
process.exit(pass ? 0 : 1);
