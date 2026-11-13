#!/usr/bin/env node
/**
 * Batch r44: load budget, voice preload latency, JAC drive avatar/cam checks (Playwright + chromium).
 * Expects a built preview at QA_BASE_URL (preview-integracion base path).
 */
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { waitForQa } from './qa-ready.mjs';

const BASE =
  process.env.QA_BASE_URL ?? 'http://127.0.0.1:4196/interactive-portfolio-playtest/preview-integracion/';
const FAST_4G = {
  offline: false,
  downloadThroughput: Math.round((9 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((9 * 1024 * 1024) / 8),
  latency: 170,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function withPage(viewport, opts, fn) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...viewport,
    hasTouch: !!opts?.touch,
    isMobile: !!opts?.touch,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (opts?.network) await cdp.send('Network.emulateNetworkConditions', opts.network);
  if (opts?.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* ignore */
    }
  });
  try {
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function loadBudgetPhone(page) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForQa(page);
  await page.waitForFunction(
    () => window.__playtestQa?.playerAvatar?.()?.loaded && window.__playtestQa?.playerAvatar?.()?.adonay?.texture,
    null,
    { timeout: 90_000 },
  );
  const ms = Date.now() - t0;
  assert.ok(ms < 12_000, `phone interactive budget (got ${ms}ms, cap 12s QA)`);
}

async function loadBudgetDesktop(page) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForQa(page);
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded, null, { timeout: 45_000 });
  const ms = Date.now() - t0;
  assert.ok(ms < 8_000, `desktop interactive budget (got ${ms}ms, cap 8s QA)`);
}

async function voicePreloadAndLatency(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForQa(page);
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded, null, { timeout: 90_000 });
  await page.evaluate(() => {
    window.__playtestQa.setAudioMuted?.(false);
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    window.__playtestQa.releaseAudioBoot?.();
    window.__playtestQa.primeVoicePreload?.();
  });
  await wait(500);
  await page.waitForFunction(
    () => window.__playtestQa.audioUnlocked?.() && (window.__playtestQa.voiceReadyIds?.() ?? []).includes('07-achievement'),
    null,
    { timeout: 90_000 },
  );
  const before = await page.evaluate(() =>
    window.__playtestQa.voiceLineReady('07-achievement'),
  );
  assert.equal(before, true, 'achievement voice decoded before trigger');
  const latency = await page.evaluate(async () => {
    const t0 = performance.now();
    window.__playtestQa.playVoiceLine('07-achievement');
    await new Promise((r) => requestAnimationFrame(r));
    const playing = document.querySelector('[data-voice-subtitle]')?.textContent?.length > 0;
    return { ms: performance.now() - t0, playing };
  });
  assert.ok(latency.playing, 'voice subtitle should appear immediately');
  assert.ok(latency.ms < 120, `voice trigger-to-feedback ${latency.ms}ms should be <120ms`);
}

async function jacDriveAvatars(page) {
  await page.goto(`${BASE}#view=0,0,1`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForQa(page);
  await page.evaluate(() => {
    window.__playtestQa.setViewMode?.('cenital');
    window.__playtestQa.setZoom?.(0.12);
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    window.__playtestQa.jacGetIn();
  });
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true, null, { timeout: 12_000 });
  const driving = await page.evaluate(() => {
    const av = window.__playtestQa.playerAvatar();
    const jac = window.__playtestQa.jac();
    const persona = window.__playtestQa.personaState?.();
    return {
      adonay: av.adonay.visible,
      pantone: av.pantone.visible,
      gear: jac?.gear,
      jacCabin: persona?.jacCabin,
      pantonePersona: persona?.pantoneVisible,
    };
  });
  assert.equal(driving.adonay, false, 'Adonay hidden while driving');
  assert.equal(driving.pantone, false, 'Pantone hidden while driving');
  if (driving.jacCabin != null) assert.equal(driving.pantonePersona, false, 'persona pantone hidden while driving');
  await page.evaluate(() => window.__playtestQa.jacGetOut?.());
  await page.waitForFunction(() => !window.__playtestQa.jac()?.driving, null, { timeout: 15_000 });
  await wait(300);
  const parked = await page.evaluate(() => {
    const av = window.__playtestQa.playerAvatar();
    return { adonay: av.adonay.visible, pantone: av.pantone.visible };
  });
  assert.equal(parked.adonay, true, 'Adonay visible after exit');
  assert.equal(parked.pantone, true, 'Pantone visible after exit');
}

async function reverseCamHidden(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForQa(page);
  await page.evaluate(() => {
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    window.__playtestQa.jacGetIn();
    window.__playtestQa.jacSet?.({ gear: 'R', engineOn: true });
  });
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving && window.__playtestQa.jac()?.gear === 'R');
  const inR = await page.evaluate(() => {
    const rear = document.querySelector('.jac-rear');
    return { gear: window.__playtestQa.jac()?.rearCam, domHidden: rear?.hidden !== false };
  });
  assert.equal(inR.gear, true);
  await page.evaluate(() => window.__playtestQa.jacSet?.({ gear: 'P' }));
  await page.waitForFunction(() => window.__playtestQa.jac()?.gear === 'P');
  const inP = await page.evaluate(() => ({
    rearCam: window.__playtestQa.jac()?.rearCam,
    entities: window.__playtestQa.jacEntities?.(),
    domHidden: document.querySelector('.jac-rear')?.hidden !== false,
    bodyClass: document.body.classList.contains('jac-rearcam'),
  }));
  assert.equal(inP.rearCam, false, 'rearCam off in P');
  assert.equal(inP.domHidden, true, 'jac-rear element hidden in P');
  assert.equal(inP.bodyClass, false, 'jac-rearcam body class off in P');
  assert.equal(inP.entities?.rearVisible, false, 'no rear PiP layer in P');
}

async function main() {
  await withPage(
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
    { touch: true, network: FAST_4G, cpu: 4 },
    loadBudgetPhone,
  );
  await withPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, {}, loadBudgetDesktop);
  await withPage(devices['iPhone 13'], { touch: true }, voicePreloadAndLatency);
  await withPage(devices['iPhone 13'], { touch: true }, jacDriveAvatars);
  await withPage(devices['iPhone 13'], { touch: true }, reverseCamHidden);
  console.log('test-batch-r44: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
