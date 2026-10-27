#!/usr/bin/env node
/** Batch r24 — Tom ui-ready-gate measured asserts + r22/r23 regression. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const PHONE = [375, 390];
const PHONE_POS = 375;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.$('#boot')) {
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(400);
}

async function setLang(page, lang) {
  for (let i = 0; i < 4; i++) {
    const cur = await page.evaluate(() => document.documentElement.lang);
    if (cur === lang) break;
    await page.evaluate(() => document.querySelector('[data-action="lang-toggle"]')?.click());
    await wait(280);
  }
}

async function dismissToDock(page) {
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(350);
  for (const ms of [350, 450]) {
    await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
    await wait(ms);
  }
}

async function main() {
  console.log('qa-batch-r24: start');
  const errors = [];
  const metrics = {};
  const browser = await chromium.launch();

  for (const w of PHONE) {
    for (const lang of ['es', 'en']) {
      const tag = `${w}-${lang}`;
      const ctx = await browser.newContext({
        viewport: { width: w, height: 812 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await boot(page);
      await setLang(page, lang);

      const tools = await page.evaluate(() => {
        const el = document.querySelector('.chrome__tools-phone');
        const r = el?.getBoundingClientRect();
        return { x: r?.x, y: r?.y, w: r?.width, h: r?.height };
      });
      metrics[`M1-${tag}`] = tools;
      if (w === PHONE_POS && (!near(tools.x, 16) || !near(tools.y, 18) || !near(tools.w, 88) || !near(tools.h, 48))) {
        errors.push(`${tag} M1 tools ${JSON.stringify(tools)}`);
      }

      const pill = await page.evaluate(() => {
        const el = document.querySelector('.checklist.checklist--phone-pill');
        const r = el?.getBoundingClientRect();
        return { x: r?.x, y: r?.y, w: r?.width, rad: el ? getComputedStyle(el).borderRadius : '' };
      });
      metrics[`H1pill-${tag}`] = pill;
      if (w === PHONE_POS && (!near(pill.x, 112) || !near(pill.w, 247))) {
        errors.push(`${tag} H1 pill ${JSON.stringify(pill)}`);
      }

      await page.evaluate(() => document.querySelector('.checklist__ring-btn')?.click());
      await wait(350);
      const open = await page.evaluate(() => {
        const card = document.querySelector('.checklist--phone-open');
        const cr = card?.getBoundingClientRect();
        const mark = card?.querySelector('.checklist__item-mark')?.getBoundingClientRect();
        const ring = card?.querySelector('.checklist__ring-btn')?.getBoundingClientRect();
        const counter = card?.querySelector('.checklist__counter--label')?.getBoundingClientRect();
        return {
          x: cr?.x,
          y: cr?.y,
          w: cr?.width,
          markCx: mark ? mark.left + mark.width / 2 : 0,
          ringCx: ring ? ring.left + ring.width / 2 : 0,
          counterRight: counter?.right,
          cardRight: cr?.right,
        };
      });
      metrics[`H1open-${tag}`] = open;
      if (w === PHONE_POS) {
        if (!near(open.x, 112) || !near(open.y, 16) || !near(open.w, 247)) {
          errors.push(`${tag} H1 open card ${JSON.stringify(open)}`);
        }
        if (!near(open.markCx, open.ringCx)) errors.push(`${tag} H1 ring/mark cx`);
        if (!near(open.counterRight ?? 0, (open.cardRight ?? 0) - 54, 3)) {
          errors.push(`${tag} H1 counter right ${open.counterRight} vs ${open.cardRight}`);
        }
      }

      await page.evaluate(() => document.querySelector('.checklist--phone-open .checklist__ring-btn')?.click());
      await wait(250);

      const peek = await page.evaluate(() => {
        const intro = document.querySelector('.chrome--intro-peek .chrome__intro');
        const ir = intro?.getBoundingClientRect();
        const blurb = document.querySelector('.chrome__blurb');
        const row = document.querySelector('.chrome__card-row');
        const br = blurb?.getBoundingClientRect();
        const rr = row?.getBoundingClientRect();
        return { h: ir?.height, gap: rr && br ? rr.top - br.bottom : 0 };
      });
      metrics[`M4-${tag}`] = peek;
      if (lang === 'en' && (peek.gap ?? 0) < 12) errors.push(`${tag} M4 EN blurb-row gap ${peek.gap}`);

      if (lang === 'es') {
        const rec = await page.evaluate(
          () => document.querySelector('[data-audience="recruiter"]')?.textContent?.trim(),
        );
        if (rec !== 'Reclutador') errors.push(`${tag} L1 recruiter "${rec}"`);
        const searchAria = await page.evaluate(
          () => document.querySelector('[data-action="search"]')?.getAttribute('aria-label'),
        );
        if (searchAria !== 'Buscar') errors.push(`${tag} L1 search aria "${searchAria}"`);
      }
      if (lang === 'en') {
        const searchAria = await page.evaluate(
          () => document.querySelector('[data-action="search"]')?.getAttribute('aria-label'),
        );
        if (searchAria !== 'Search') errors.push(`${tag} L1 search aria EN "${searchAria}"`);
      }

      await dismissToDock(page);
      const dock = await page.evaluate(() => {
        const el = document.querySelector('.chrome__dock');
        const r = el?.getBoundingClientRect();
        const btns = el ? [...el.querySelectorAll('.ui-round, [data-dock]')] : [];
        const first = btns[0]?.getBoundingClientRect();
        const gap = btns.length > 1 && first ? btns[1].getBoundingClientRect().left - first.right : 0;
        return {
          x: r?.x,
          y: r?.y,
          w: r?.width,
          h: r?.height,
          count: btns.length,
          btn: first ? { w: first.width, h: first.height } : null,
          gap,
          hasArticles: !!el?.querySelector('[data-action="articles"]'),
        };
      });
      metrics[`M2-${tag}`] = dock;
      if (w === PHONE_POS) {
        if (!near(dock.x, 51.5) || !near(dock.y, 748) || !near(dock.w, 272) || dock.count !== 5) {
          errors.push(`${tag} M2 dock ${JSON.stringify(dock)}`);
        }
        if (dock.hasArticles) errors.push(`${tag} M2 dock still has articles button`);
        if (dock.btn && (!near(dock.btn.w, 48) || !near(dock.btn.h, 48))) {
          errors.push(`${tag} M2 dock btn size ${JSON.stringify(dock.btn)}`);
        }
        if (!near(dock.gap, 8)) errors.push(`${tag} M2 dock gap ${dock.gap}`);
      }

      await page.evaluate(() => document.querySelector('[data-dock="intro"]')?.click());
      await page.evaluate(() => document.querySelector('[data-details]')?.click());
      await wait(450);
      const m3phone = await page.evaluate(() => {
        const cl = document.querySelector('.checklist');
        const r = cl?.getBoundingClientRect();
        return {
          x: r?.x,
          y: r?.y,
          w: r?.width,
          h: r?.height,
          circle: cl?.classList.contains('checklist--phone-circle'),
          hidden: cl?.hidden,
        };
      });
      metrics[`M3-${tag}`] = m3phone;
      metrics[`L2-${tag}`] = m3phone;
      if (w === PHONE_POS) {
        if (!m3phone.circle || m3phone.hidden) errors.push(`${tag} M3 phone checklist ${JSON.stringify(m3phone)}`);
        if (!near(m3phone.x, 311) || !near(m3phone.y, 16) || !near(m3phone.w, 48) || !near(m3phone.h, 48)) {
          errors.push(`${tag} L2 circle ${JSON.stringify(m3phone)}`);
        }
      }

      await ctx.close();
    }
  }

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desk.newPage();
  await boot(page);

  await page.evaluate(() => {
    const btn = document.querySelector('.checklist__ring-btn');
    if (btn && !document.querySelector('.checklist--collapsed')) btn.click();
  });
  await wait(300);
  const collapsed = await page.evaluate(() => {
    const el = document.querySelector('.checklist.checklist--collapsed');
    const r = el?.getBoundingClientRect();
    const label = el?.querySelector('.checklist__counter--label');
    const ls = label ? getComputedStyle(label) : null;
    return {
      x: r?.x,
      y: r?.y,
      w: r?.width,
      h: r?.height,
      labelDisplay: ls?.display,
    };
  });
  metrics.H2 = collapsed;
  if (!near(collapsed.w, 40) || !near(collapsed.h, 40) || !near(collapsed.x, 1378) || !near(collapsed.y, 22)) {
    errors.push(`H2 collapsed ${JSON.stringify(collapsed)}`);
  }
  if (collapsed.labelDisplay !== 'none') errors.push(`H2 label display ${collapsed.labelDisplay}`);

  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="home"]')?.click());
  await wait(500);
  await page.evaluate(() => document.querySelector('#chrome-articulos')?.scrollIntoView({ block: 'start' }));
  await wait(200);
  const m3 = await page.evaluate(() => {
    const cl = document.querySelector('.checklist');
    const r = cl?.getBoundingClientRect();
    const cs = cl ? getComputedStyle(cl) : null;
    return { w: r?.width, opacity: cs?.opacity, hidden: cl?.hidden, x: r?.x, y: r?.y };
  });
  metrics.M3desk = m3;
  if (m3.hidden || parseFloat(m3.opacity ?? '1') < 0.9) errors.push(`M3 desktop checklist split ${JSON.stringify(m3)}`);
  if (!near(m3.w, 40) && !near(m3.w, 296)) errors.push(`M3 desktop checklist width ${m3.w}`);

  await page.evaluate(() => document.querySelector('[data-action="panel-only"]')?.click());
  await wait(450);
  const m3panel = await page.evaluate(() => {
    const cl = document.querySelector('.checklist');
    const cs = cl ? getComputedStyle(cl) : null;
    return { opacity: cs?.opacity, layout: document.body.dataset.layout };
  });
  metrics.M3deskExpanded = m3panel;
  if (parseFloat(m3panel.opacity ?? '1') > 0.05) {
    errors.push(`M3 desktop expanded opacity ${m3panel.opacity}`);
  }

  const m6 = await page.evaluate(() => ({
    articulosCount: document.querySelector('#chrome-articulos [data-section-count]')?.textContent?.trim(),
    charlasCount: document.querySelector('#chrome-charlas [data-section-count]')?.textContent?.trim(),
    articulosRows: document.querySelectorAll('#chrome-articulos .chrome__content-row').length,
    expPanelOpen: document.querySelector('.building-panel--experience.building-panel--open') != null,
    railArticles: document.querySelector('.chrome__rail [data-action="articles"]'),
  }));
  metrics.M6 = m6;
  if (m6.articulosCount !== '5') errors.push(`M6 articulos count "${m6.articulosCount}"`);
  if (m6.charlasCount !== '14') errors.push(`M6 charlas count "${m6.charlasCount}"`);
  if (m6.railArticles) errors.push('M6 rail still has articles icon');
  if (m6.expPanelOpen) errors.push('M6 experience panel open for list');

  const rail = await page.evaluate(() => {
    const stack = document.querySelector('.chrome__tools-stack');
    const r = stack?.getBoundingClientRect();
    return { x: r?.x, y: r?.y, w: r?.width, h: r?.height };
  });
  metrics.M7 = rail;
  if (!near(rail.x, 12) || !near(rail.w, 40) || !near(rail.h, 160)) errors.push(`M7 rail tools ${JSON.stringify(rail)}`);

  await desk.close();
  await browser.close();

  if (process.env.QA_SKIP_REGRESSION !== '1') {
    for (const script of ['qa-batch-r22.mjs', 'qa-batch-r23.mjs']) {
      const r = spawnSync('node', [`scripts/${script}`], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, QA_BASE_URL: BASE },
        timeout: 720000,
      });
      if (r.status !== 0) {
        errors.push(`${script} failed`);
        for (const line of `${r.stdout}\n${r.stderr}`.split('\n').filter(Boolean).slice(0, 4)) {
          errors.push(`${script}: ${line}`);
        }
      }
    }
  }

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  console.log('qa-batch-r24: ok');
  console.log('METRICS', JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
