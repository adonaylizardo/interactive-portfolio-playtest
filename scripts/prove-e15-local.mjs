#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4174/preview-edificios/';
const OUT = '/opt/cursor/artifacts/e15-local';

const report = { base: BASE, checks: [] };

function push(id, pass, detail) {
  report.checks.push({ id, pass, ...detail });
}

const browser = await chromium.launch();
try {
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('[data-action="about-contact"]')?.click());
    await page.waitForSelector('.about-panel--open', { timeout: 15000 });
    const close = page.locator('[data-about-close]').first();
    const closeBox = await close.boundingBox();
    if (closeBox) {
      const cx = closeBox.x + closeBox.width / 2;
      const cy = closeBox.y + closeBox.height / 2;
      const hit = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return {
            tag: el?.tagName,
            cls: el?.className?.toString?.() ?? '',
            isClose: !!el?.closest?.('[data-about-close], .about-panel__close'),
          };
        },
        { x: cx, y: cy },
      );
      push('844 About × hit-testable', hit.isClose, { hit, closeBox });
      await close.click({ force: false });
      await page.waitForTimeout(400);
      const open = await page.evaluate(() => document.body.classList.contains('about-panel-open'));
      push('844 About closes on × tap', !open, { open });
    }
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(800);
    const intro = page.locator('.chrome__intro');
    const overflow = await intro.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      delta: el.scrollHeight - el.clientHeight,
    }));
    push('844 intro no overflow', overflow.delta <= 0, overflow);
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1000);
    await page.locator('.chrome__rail [data-action="contact"]').click();
    await page.waitForTimeout(1200);
    const sub = page.locator('#voice-subtitle');
    await sub.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const toast = await sub.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const viewBtn = document.querySelector('[data-view="isometrica"]');
      const vb = viewBtn?.getBoundingClientRect();
      return {
        width: r.width,
        text: el.textContent?.trim(),
        bottom: r.bottom,
        overlapsView:
          vb && r.right > vb.left - 4 && r.bottom > vb.top - 4 && r.top < vb.bottom + 4,
      };
    });
    push('1280 contact toast content-width', toast.width > 0 && toast.width < 320, toast);
    push('1280 contact toast clear of Isométrica', !toast.overlapsView, toast);
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.pass);
process.exit(failed.length ? 1 : 0);
