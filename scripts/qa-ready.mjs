/**
 * Sprite frames make first paint slower when several QA pages share one software-GL browser.
 * Every navigation waits (up to 45 s) for the app's QA hooks before the test goes on.
 */
import { spawnSync } from 'node:child_process';
import { QA_CI, QA_REDUCE_DPR, ciContextOptions } from './qa-ci.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForQa(page) {
  if (!/^https?:/.test(page.url())) return;
  const attempts = QA_CI ? 900 : 450;
  for (let i = 0; i < attempts; i++) {
    try {
      const state = await page.evaluate(() => {
        if (typeof window.__playtestQa?.enterInterior === 'function') return 'ready';
        const btn = document.querySelector('[data-boot-start]');
        if (btn && !btn.closest('[hidden]')) return 'welcome';
        return 'loading';
      });
      if (state === 'ready') return;
      // The map stays behind the welcome sheet until the visitor taps Start.
      // QA navigations take that tap; a hash reload skips the sheet on its own.
      if (state === 'welcome') {
        await page.locator('[data-boot-start]').click({ timeout: 3000 }).catch(() => {});
      }
    } catch {
      /* navigation in flight */
    }
    await wait(100);
  }
  throw new Error(
    `QA hooks did not install within ${QA_CI ? 90 : 45}s (__playtestQa.enterInterior missing)`,
  );
}

export { waitForQa };

/** Desktop sheet slides in over ~250ms; don't probe Exit until translate settles. */
export async function waitForBuildingPanelSettled(page) {
  await page.waitForFunction(
    () => {
      if (!window.__playtestQa?.isBuildingPanelOpen?.()) return false;
      const sheet = document.querySelector('.building-panel--open .building-panel__sheet');
      if (!sheet) return false;
      const tr = getComputedStyle(sheet).transform;
      if (!tr || tr === 'none') return true;
      const m = tr.match(/matrix\(([^)]+)\)/);
      if (!m) return true;
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      const tx = parts[4] ?? 0;
      const ty = parts[5] ?? 0;
      const phone = window.matchMedia('(max-width: 767px)').matches;
      if (phone) {
        const panel = document.querySelector('.building-panel--open');
        if (panel?.classList.contains('building-panel--peek')) return true;
        // Bottom sheet: peek translate (~-11px) or full open (0) — not mid-slide.
        return Math.abs(ty) > 24 || Math.abs(ty) < 2;
      }
      return Math.abs(tx) < 2 && Math.abs(ty) < 2;
    },
    null,
    { timeout: 15000 },
  );
}

function patchPage(page) {
  if (page.__qaReady) return;
  page.__qaReady = true;
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (url, opts = {}) => {
    const r = await goto(url, { timeout: QA_CI ? 90_000 : 60_000, ...opts });
    await waitForQa(page);
    return r;
  };
  page.reload = async (opts = {}) => {
    const r = await reload({ timeout: QA_CI ? 90_000 : 60_000, ...opts });
    await waitForQa(page);
    return r;
  };
}

async function patchContext(ctx) {
  // The town defaults to Spanish. These checks assert the English copy.
  await ctx.addInitScript(
    ({ ci, reduceDpr }) => {
      try {
        localStorage.setItem('portfolio-playtest-lang', 'en');
      } catch {
        /* private mode */
      }
      if (ci) window.__qaCiFastExit = true;
      if (reduceDpr) {
        try {
          Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 1 });
        } catch {
          /* readonly in some embeds */
        }
      }
    },
    { ci: QA_CI, reduceDpr: QA_REDUCE_DPR },
  );
  ctx.pages().forEach(patchPage);
  ctx.on('page', patchPage);
  const newPage = ctx.newPage.bind(ctx);
  ctx.newPage = async (...a) => {
    const p = await newPage(...a);
    patchPage(p);
    return p;
  };
  return ctx;
}

function installReadyWait(browser) {
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newContext = async (opts) => await patchContext(await newContext(ciContextOptions(opts ?? {})));
  browser.newPage = async (...a) => {
    const p = await newPage(...a);
    patchPage(p);
    return p;
  };
  return browser;
}

/**
 * Chromium's default software GL is SwiftShader. QA_GL=llvmpipe switches to Mesa llvmpipe through
 * ANGLE's EGL backend (works without an X display; needs Mesa's EGL/GL drivers): about 3x the
 * average frame rate, but it stalls for hundreds of ms now and then, which skews walk timings.
 */
const CHROMIUM_GL_ARGS = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  ...(process.env.QA_GL === 'llvmpipe'
    ? ['--use-angle=gl-egl', '--ignore-gpu-blocklist']
    : ['--disable-gpu-compositing']),
];

/**
 * Pixi caps a frame's game time at 100 ms, so once frames take longer than that game time runs slow.
 * When the 90th-percentile frame misses that (under 10 fps; software GL on CI draws ~4), checks
 * that time walks, glides or animations report instead of failing.
 */
export const TIMING_MIN_FPS = 10;

function directChildPids(pid) {
  const out = spawnSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).stdout || '';
  const kids = [];
  for (const line of out.split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number);
    if (parent === pid && child) kids.push(child);
  }
  return kids;
}

function killTree(pid) {
  for (const child of directChildPids(pid)) killTree(child);
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

/**
 * Headless WebKit sometimes starts MiniBrowser and then never answers the inspector pipe.
 * `browser.process()` is empty for that launch, so the new child of this process is the handle.
 * Kill that tree so the suite records a crash instead of sitting there.
 */
function armWebkitWatchdog(browser, roots) {
  const proc = typeof browser.process === 'function' ? browser.process() : null;
  if (proc?.pid) roots.add(proc.pid);
  if (!roots.size) return;
  const timer = setTimeout(() => {
    for (const pid of roots) killTree(pid);
  }, 120000);
  timer.unref();
  const close = browser.close.bind(browser);
  browser.close = async (...args) => {
    clearTimeout(timer);
    return close(...args);
  };
}

/** Launches a Playwright browser type with the QA GL backend and the QA-hook readiness wait. */
export async function launchBrowser(type, options = {}) {
  const args = type.name() === 'chromium' ? [...CHROMIUM_GL_ARGS, ...(options.args ?? [])] : options.args;
  const before = new Set(type.name() === 'webkit' ? directChildPids(process.pid) : []);
  const browser = installReadyWait(await type.launch({ ...options, args }));
  if (type.name() === 'webkit') {
    armWebkitWatchdog(browser, new Set(directChildPids(process.pid).filter((pid) => !before.has(pid))));
  }
  return browser;
}

/**
 * Phone portrait keeps the arrival intro over the map until it is closed.
 * Layout checks assert that sheet, so this is not part of the navigation wait.
 */
export async function dismissArrivalSheet(page) {
  await page
    .evaluate(() => {
      const btn = document.querySelector('.chrome--sheet [data-action="intro-close"]');
      if (btn instanceof HTMLElement) btn.click();
    })
    .catch(() => {});
}

/** SwiftShader / headless GL sometimes kills the tab without a real app failure. */
export function isBrowserCrash(err) {
  const s = String(err);
  return /Target crashed|Page crashed|has been closed|Browser has been closed/i.test(s);
}

/**
 * Re-run `fn` in a fresh browser when the renderer crashes (up to `attempts` times).
 * Assertion / pixel failures propagate immediately.
 */
export async function withFreshBrowser(type, launchOptions, fn, { attempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const browser = await launchBrowser(type, launchOptions);
    try {
      return await fn(browser);
    } catch (err) {
      lastErr = err;
      if (!isBrowserCrash(err) || attempt === attempts - 1) throw err;
    } finally {
      await browser.close().catch(() => {});
    }
  }
  throw lastErr;
}
