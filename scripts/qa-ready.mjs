/**
 * Sprite frames make first paint slower when several QA pages share one software-GL browser.
 * Every navigation waits (up to 45 s) for the app's QA hooks before the test goes on.
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForQa(page) {
  if (!/^https?:/.test(page.url())) return;
  for (let i = 0; i < 450; i++) {
    try {
      if (await page.evaluate(() => Boolean(window.__playtestQa?.isInInterior))) return;
    } catch {
      /* navigation in flight */
    }
    await wait(100);
  }
}

function patchPage(page) {
  if (page.__qaReady) return;
  page.__qaReady = true;
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (...a) => {
    const r = await goto(...a);
    await waitForQa(page);
    return r;
  };
  page.reload = async (...a) => {
    const r = await reload(...a);
    await waitForQa(page);
    return r;
  };
}

async function patchContext(ctx) {
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    } catch {
      /* ignore */
    }
  });
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
  browser.newContext = async (...a) => await patchContext(await newContext(...a));
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

/** Launches a Playwright browser type with the QA GL backend and the QA-hook readiness wait. */
export async function launchBrowser(type, options = {}) {
  const args = type.name() === 'chromium' ? [...CHROMIUM_GL_ARGS, ...(options.args ?? [])] : options.args;
  return installReadyWait(await type.launch({ ...options, args }));
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
