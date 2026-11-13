#!/usr/bin/env node
/**
 * QA e6: opening a case preview during 01-intro must not break later voice lines.
 */
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://127.0.0.1:${Number(process.env.PREVIEW_PORT ?? 4195)}/interactive-portfolio-playtest/preview-edificios/`;

const preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await launchBrowser(chromium);
let pass = false;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 90000,
  });
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.setAudioMuted?.(false);
  });

  await page.mouse.click(640, 400);
  await page.waitForTimeout(120);

  await page.evaluate(() => window.__playtestQa.prepareDoorEntryForQa?.('volaris'));
  const pt = await page.evaluate(() => window.__playtestQa.doorScreenPoint('volaris'));
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(800);

  const afterPreview = await page.evaluate(() => ({
    previewOpen: document.querySelector('.building-panel--preview.building-panel--open') != null,
    subtitle: document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '',
    unlocked: window.__playtestQa.audioUnlocked?.(),
  }));

  await page.evaluate(() => window.__playtestQa.dismissBuildingPanel?.());
  await page.waitForTimeout(400);

  const contact = await page.evaluate(() => {
    const btn = document.querySelector('.chrome__rail [data-action="contact"]');
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (contact) await page.mouse.click(contact.x, contact.y);
  await page.waitForTimeout(1200);

  const afterContact = await page.evaluate(() => ({
    subtitle: document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '',
    voicePlaying: window.__playtestQa.audioUnlocked?.(),
  }));

  pass =
    afterPreview.previewOpen &&
    afterPreview.subtitle.length > 0 &&
    /talk|hablamos|let's/i.test(afterContact.subtitle);

  console.log(
    JSON.stringify({ pass, afterPreview, afterContact }, null, 2),
  );
  await page.close();
} finally {
  await browser.close();
  preview.kill();
}

process.exit(pass ? 0 : 1);
