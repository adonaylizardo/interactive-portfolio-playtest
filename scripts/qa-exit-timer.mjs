/**
 * Times an interior exit inside the page: from the first pointer/touch/mouse down to the frame where
 * the scene reports it has left the room. Playwright round-trips and polling are excluded, so slow CI
 * runners measure the game's response rather than the harness's.
 */
export async function armExitTimer(page) {
  await page.evaluate(() => {
    const t = { down: 0, left: 0 };
    window.__qaExitTimer = t;
    const onDown = () => {
      if (!t.down) t.down = performance.now();
    };
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
      addEventListener(type, onDown, { capture: true, once: true });
    }
    const id = setInterval(() => {
      if (t.down && !window.__playtestQa?.isInInterior?.()) {
        t.left = performance.now();
        clearInterval(id);
      }
    }, 4);
  });
}

/** Resolves to the in-page exit time in ms, or null if the room is still open after `maxWallMs`. */
export async function readExitTimer(page, maxWallMs = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxWallMs) {
    const t = await page.evaluate(() => window.__qaExitTimer);
    if (t?.left) return Math.round(t.left - t.down);
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}
