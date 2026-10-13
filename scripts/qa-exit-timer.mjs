/**
 * Times an interior exit inside the page: from the first pointer/touch/mouse down to the moment the
 * scene reports it has left the room. Playwright round-trips and polling are excluded. It also counts
 * rendered frames and records whether the character stepped off its tile before leaving, so that
 * software-GL CI runners (a few fps, with touch taps held 120 ms for pinch detection) can be judged by
 * "left within a few frames without walking" instead of wall-clock ms.
 */
export async function armExitTimer(page) {
  await page.evaluate(() => {
    const qa = window.__playtestQa;
    const t = { down: 0, left: 0, frames: 0, walked: false, start: qa?.interiorCharTile?.() ?? null };
    window.__qaExitTimer = t;
    const onDown = () => {
      if (!t.down) t.down = performance.now();
    };
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
      addEventListener(type, onDown, { capture: true, once: true });
    }
    const raf = () => {
      if (t.left) return;
      if (t.down) t.frames++;
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    const id = setInterval(() => {
      if (!t.down) return;
      if (!qa?.isInInterior?.()) {
        t.left = performance.now();
        clearInterval(id);
        return;
      }
      const c = qa.interiorCharTile?.();
      if (c && t.start && (c.x !== t.start.x || c.y !== t.start.y)) t.walked = true;
    }, 4);
  });
}

/**
 * Resolves to `{ ms, frames, walked }` for the exit, or null if the room is still open after `maxWallMs`.
 */
export async function readExitTimer(page, maxWallMs = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxWallMs) {
    const t = await page.evaluate(() => window.__qaExitTimer);
    if (t?.left) return { ms: Math.round(t.left - t.down), frames: t.frames, walked: t.walked };
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

/**
 * Immediate = no walk first, and under the ms budget, or (slow renderer, ~180 ms/frame) within 6 frames
 * and 1.5 s of the tap. The walk-first regression this guards against took > 3.5 s.
 */
export function exitIsImmediate(r, budgetMs = 700) {
  return !!r && !r.walked && (r.ms <= budgetMs || (r.frames <= 6 && r.ms <= 1500));
}

export function describeExit(r) {
  return r ? `${r.ms} ms, ${r.frames} frame(s)${r.walked ? ', walked first' : ''}` : 'no exit';
}
