#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';
const OUT = '/opt/cursor/artifacts/e13-deploy';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = { base: BASE, bundle: null, checks: [] };

try {
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(500);
    await page.touchscreen.tap(195, 500);
    await page.waitForTimeout(600);
    report.bundle = await page.evaluate(() => ({
      js: [...document.querySelectorAll('script[src*="index-"]')].map((s) => s.src),
      css: [...document.querySelectorAll('link[href*="index-"]')].map((l) => l.href),
    }));
    await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
    await page.waitForTimeout(300);
    const contactBtn = page.locator('.chrome__dock [data-action="contact"]');
    const cbox = await contactBtn.boundingBox();
    if (cbox) await page.touchscreen.tap(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
    await page.waitForTimeout(1500);
    const contact = await page.evaluate(() => {
      const sub = document.getElementById('voice-subtitle');
      return {
        text: sub?.textContent ?? '',
        parent: sub?.parentElement?.tagName ?? null,
        hidden: sub?.hidden ?? true,
      };
    });
    report.checks.push({
      id: '390 contact voice caption',
      pass: /Hablemos|talk/i.test(contact.text) && contact.parent === 'BODY',
      contact,
    });
    await page.screenshot({ path: `${OUT}/390-contact-toast.png` });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('.chrome__dock [data-action="achievements"]')?.click());
    await page.waitForTimeout(800);
    const sheetTop = Math.floor(
      (await page.evaluate(
        () => document.querySelector('.chrome__intro')?.getBoundingClientRect().top ?? 230,
      )) || 230,
    );
    const bandBuf = await page.screenshot({ type: 'png' });
    await ctx.close();
    const png = PNG.sync.read(bandBuf);
    await mkdir(OUT, { recursive: true });
    const fs = await import('node:fs/promises');
    await fs.writeFile(`${OUT}/390-logros-map-band.png`, bandBuf);
    let bright = 0;
    let total = 0;
    for (let y = 0; y < sheetTop; y++) {
      for (let x = 21; x < Math.min(369, png.width); x++) {
        const i = (png.width * y + x) * 4;
        if (png.data[i] > 240 && png.data[i + 1] > 240 && png.data[i + 2] > 240) bright++;
        total++;
      }
    }
    report.checks.push({
      id: '390 logros unpainted band',
      pass: total > 0 && bright / total < 0.08,
      brightFrac: total ? bright / total : 1,
    });
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(600);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/390-to-844-rotation.png`, fullPage: false });
    const band = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return {
        w: c?.clientWidth,
        h: c?.clientHeight,
        sw: c?.width,
        sh: c?.height,
      };
    });
    report.checks.push({
      id: '844 rotation canvas size',
      pass: band.w === 844 && band.h === 390,
      band,
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.pass);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
