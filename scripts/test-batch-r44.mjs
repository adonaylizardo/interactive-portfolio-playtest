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

function readBootMarks() {
  const nav = performance.getEntriesByType('navigation')[0]?.startTime ?? 0;
  const pick = (name) => {
    const e = performance.getEntriesByName(name)[0];
    return e && typeof e.startTime === 'number' ? e.startTime - nav : null;
  };
  return {
    mapVisibleMs: pick('playtest-map-visible') ?? pick('playtest-map-first-frame'),
    ttiMs: pick('playtest-tti'),
  };
}

function warnBudget(label, ms, targetMs) {
  if (ms == null) {
    console.warn(`${label}: missing performance mark`);
    return;
  }
  if (ms > targetMs) {
    console.warn(`${label}: ${(ms / 1000).toFixed(2)}s exceeds target ${(targetMs / 1000).toFixed(2)}s (CI noisy — warn only)`);
  }
}

async function loadBudgetPhone(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForQa(page);
  await page.waitForFunction(
    () => {
      const q = window.__playtestQa?.playerAvatar?.();
      if (!q?.loaded || !q?.adonay?.texture) return false;
      return typeof performance.getEntriesByName('playtest-tti')[0]?.startTime === 'number';
    },
    null,
    { timeout: 90_000 },
  );
  const marks = await page.evaluate(readBootMarks);
  warnBudget('phone TTI', marks.ttiMs, 4000);
  warnBudget('phone map-visible', marks.mapVisibleMs, 4000);
  assert.ok(marks.ttiMs != null && marks.ttiMs < 12_000, `phone interactive cap (got ${marks.ttiMs}ms)`);
}

async function loadBudgetDesktop(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForQa(page);
  await page.waitForFunction(
    () =>
      window.__playtestQa?.playerAvatar?.()?.loaded &&
      typeof performance.getEntriesByName('playtest-tti')[0]?.startTime === 'number',
    null,
    { timeout: 45_000 },
  );
  const marks = await page.evaluate(readBootMarks);
  warnBudget('desktop TTI', marks.ttiMs, 2000);
  warnBudget('desktop map-visible', marks.mapVisibleMs, 2000);
  assert.ok(marks.ttiMs != null && marks.ttiMs < 8_000, `desktop interactive cap (got ${marks.ttiMs}ms)`);
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
    let audible = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (window.__playtestQa.voiceAudible?.()) {
        audible = true;
        break;
      }
    }
    const playing = document.querySelector('[data-voice-subtitle]')?.textContent?.length > 0;
    const ctxRunning = window.__playtestQa.voiceContextRunning?.();
    return { ms: performance.now() - t0, playing, audible, ctxRunning };
  });
  assert.ok(latency.playing, 'voice subtitle should appear immediately');
  assert.ok(latency.audible, 'voice should start (buffer or HTMLAudio)');
  assert.ok(latency.ctxRunning, 'AudioContext should be running during playback');
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

async function rearPipAbsentInAllGears(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForQa(page);
  await page.evaluate(() => {
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    window.__playtestQa.jacGetIn();
    window.__playtestQa.jacSet?.({ engineOn: true });
  });
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true);
  for (const gear of ['R', 'N', 'D', 'P']) {
    await page.evaluate((g) => window.__playtestQa.jacSet?.({ gear: g }), gear);
    await page.waitForFunction((g) => window.__playtestQa.jac()?.gear === g, gear);
    const state = await page.evaluate(() => ({
      rearEl: document.querySelector('.jac-rear'),
      bodyClass: document.body.classList.contains('jac-rearcam'),
      rearVisible: window.__playtestQa.jacEntities?.()?.rearVisible,
    }));
    assert.equal(state.rearEl, null, `no .jac-rear in DOM for gear ${gear}`);
    assert.equal(state.bodyClass, false, `jac-rearcam off in ${gear}`);
    assert.equal(state.rearVisible, false, `no rear PiP layer in ${gear}`);
  }
}

async function ambienceUnlock(page) {
  const ambienceUrls = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/ambience-nature\.(mp3|ogg)/i.test(u)) ambienceUrls.push(u);
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForQa(page);
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded, null, { timeout: 90_000 });
  await page.evaluate(() => {
    window.__playtestQa.setAudioMuted?.(true);
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    window.__playtestQa.releaseAudioBoot?.();
  });
  await wait(900);
  const mutedSnap = await page.evaluate(() => ({
    requested: window.__playtestQa.ambienceRequested?.(),
    started: window.__playtestQa.ambienceStarted?.(),
  }));
  assert.equal(mutedSnap.requested, false, 'ambience fetch should not run while muted');
  assert.equal(mutedSnap.started, false, 'ambience source should not start while muted');
  assert.equal(ambienceUrls.length, 0, 'no ambience-nature request while muted');

  await page.evaluate(() => {
    window.__playtestQa.setAudioMuted?.(false);
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () =>
      window.__playtestQa.ambienceRequested?.() &&
      window.__playtestQa.ambienceStarted?.() &&
      window.__playtestQa.voiceContextRunning?.(),
    null,
    { timeout: 20_000 },
  );
  assert.ok(ambienceUrls.length >= 1, 'ambience-nature should be requested after unmuted tap');
}

async function voiceSingleFetch(page) {
  const voiceHits = new Map();
  page.on('request', (req) => {
    const u = req.url();
    if (!/\/audio\/voice\//.test(u)) return;
    const name = u.split('/').pop()?.split('?')[0] ?? u;
    voiceHits.set(name, (voiceHits.get(name) ?? 0) + 1);
  });
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
  await page.waitForFunction(
    () => (window.__playtestQa.voiceReadyIds?.() ?? []).length >= 12,
    null,
    { timeout: 90_000 },
  );
  assert.ok(voiceHits.size >= 12, `expected voice files, got ${voiceHits.size}`);
  for (const [file, n] of voiceHits) {
    assert.equal(n, 1, `voice ${file} should be fetched once, got ${n}`);
  }
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
  await withPage(devices['iPhone 13'], { touch: true }, rearPipAbsentInAllGears);
  await withPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, {}, ambienceUnlock);
  await withPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, {}, voiceSingleFetch);
  console.log('test-batch-r44: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
