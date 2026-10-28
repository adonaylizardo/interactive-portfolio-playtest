#!/usr/bin/env node
/**
 * r34: every desktop chrome control must fit inside the viewport.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4197;
const BASE =
  process.argv.find((a) => /^https?:/.test(a)) ??
  process.env.QA_BASE_URL ??
  `http://127.0.0.1:${PORT}/interactive-portfolio-playtest/`;
const VIEWPORTS = [
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
const SELECTORS = [
  '.chrome__rail [data-action="home"]',
  '.chrome__rail [data-action="search"]',
  '.chrome__rail [data-action="sound"]',
  '.chrome__rail [data-action="lang-toggle"]',
  '.chrome__tab',
  '.checklist',
  '.chrome__sound',
  '.chrome__view-btns',
  '.chrome__locate',
  '.chrome__minimap-wrap',
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensurePreview() {
  if (process.env.QA_BASE_URL) return;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    await wait(250);
    try {
      const res = await fetch(BASE, { method: 'HEAD' });
      if (res.ok) return () => child.kill('SIGTERM');
    } catch {
      /* retry */
    }
  }
  child.kill('SIGTERM');
  throw new Error('preview did not start');
}

export async function runR34ChromeViewport({ base = BASE, errors = [] } = {}) {
  const browser = await launchBrowser(chromium);
  try {
    for (const [w, h] of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
      await wait(300);
      const bad = await page.evaluate(
        (sels) => {
          const vw = innerWidth;
          const vh = innerHeight;
          const out = [];
          for (const sel of sels) {
            const el = document.querySelector(sel);
            if (!el || getComputedStyle(el).display === 'none' || el.hidden) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
              out.push({
                sel,
                rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
                vw,
                vh,
              });
            }
          }
          return out;
        },
        SELECTORS,
      );
      for (const b of bad) {
        errors.push(
          `${w}x${h} ${b.sel} outside viewport (${Math.round(b.rect.x)},${Math.round(b.rect.y)}–${Math.round(b.rect.right)},${Math.round(b.rect.bottom)} vs ${b.vw}x${b.vh})`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stop = await ensurePreview().catch(() => null);
  const errors = [];
  await runR34ChromeViewport({ errors });
  if (stop) stop();
  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log('qa-batch-r34-chrome-viewport: ok');
}
