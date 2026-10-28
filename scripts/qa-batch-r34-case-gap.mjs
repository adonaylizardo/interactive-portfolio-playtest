#!/usr/bin/env node
/**
 * r34: desktop case interior peek card must not block exit gap/mat (elementFromPoint → canvas).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4196;
const BASE =
  process.argv.find((a) => /^https?:/.test(a)) ??
  process.env.QA_BASE_URL ??
  `http://127.0.0.1:${PORT}/interactive-portfolio-playtest/`;
const CASE_ROOMS = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'];
const VIEWPORTS = [
  [1280, 800],
  [1440, 900],
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

async function tilePoint(page, tx, ty) {
  return page.evaluate(
    ([x, y]) => {
      const qa = window.__playtestQa;
      const p = qa.worldToClient((x - y) * 64, (x + y) * 32 + 32);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },
    [tx, ty],
  );
}

async function probeRoom(page, room, width, height, target) {
  await page.setViewportSize({ width, height });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((id) => window.__playtestQa.enterInterior(id), room);
  await page.waitForSelector('.case-preview__read', { state: 'visible', timeout: 15000 });
  const layout = await page.evaluate(() => window.__playtestQa.interiorLayout());
  if (!layout) return { ok: false, err: 'no layout' };
  const gap = target === 'mat' ? 0 : 0.8;
  const tx =
    layout.exitFace === '+x' ? layout.exit.x + gap : layout.exit.x;
  const ty =
    layout.exitFace === '+x' ? layout.exit.y : layout.exit.y + gap;
  const pt = await tilePoint(page, tx, ty);
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { id: el?.id ?? '', tag: el?.tagName ?? '', cls: el?.className?.slice?.(0, 48) ?? '' };
    },
    [pt.x, pt.y],
  );
  const ok = hit.id === 'game-canvas' || hit.tag === 'CANVAS';
  return { ok, pt, hit, room, target, width, height };
}

const stop = await ensurePreview().catch(() => null);
const browser = await launchBrowser(chromium);
const errors = [];
try {
  for (const [w, h] of VIEWPORTS) {
    for (const room of CASE_ROOMS) {
      for (const target of ['gap', 'mat']) {
        const page = await browser.newPage();
        try {
          const r = await probeRoom(page, room, w, h, target);
          if (!r.ok) {
            errors.push(
              `${room}@${w}x${h} ${target}: elementFromPoint(${r.pt?.x},${r.pt?.y}) → ${r.hit?.tag}#${r.hit?.id} ${r.hit?.cls}`,
            );
          } else {
            console.log(`ok ${room}@${w} ${target} canvas@${r.pt.x},${r.pt.y}`);
          }
        } finally {
          await page.close();
        }
      }
    }
  }
} finally {
  await browser.close();
  if (stop) stop();
}
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('qa-batch-r34-case-gap: all probes on canvas');
