import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPreview(url, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await wait(500);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

async function waitForInterior(page) {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => window.__playtestQa?.isInInterior?.() === true)) return true;
    await wait(250);
  }
  return false;
}

async function main() {
  const preview = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: 'pipe',
  });
  if (!(await waitForPreview(BASE))) {
    preview.kill('SIGTERM');
    throw new Error('preview not ready');
  }
  const dir = path.join(root, 'artifacts', 'run32');
  await mkdir(dir, { recursive: true });
  const names = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];
  const browser = await chromium.launch();
  try {
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const name of names) {
      await desktop.goto(BASE, { waitUntil: 'networkidle' });
      await desktop.reload({ waitUntil: 'networkidle' });
      await wait(500);
      await desktop.evaluate((n) => window.__playtestQa?.enterInterior?.(n), name);
      await waitForInterior(desktop);
      await wait(500);
      await desktop.screenshot({ path: path.join(dir, `interior-${name}-desktop.png`) });
      await desktop.keyboard.press('Escape');
      await wait(600);
    }
    await desktop.close();
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
    for (const name of names) {
      await mobile.goto(BASE, { waitUntil: 'networkidle' });
      await mobile.reload({ waitUntil: 'networkidle' });
      await wait(500);
      await mobile.evaluate((n) => window.__playtestQa?.enterInterior?.(n), name);
      await waitForInterior(mobile);
      await wait(500);
      await mobile.screenshot({ path: path.join(dir, `interior-${name}-375.png`) });
      await mobile.keyboard.press('Escape');
      await wait(600);
    }
    await mobile.close();
  } finally {
    await browser.close();
    preview.kill('SIGKILL');
  }
  console.log('Saved run32 captures to', dir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
