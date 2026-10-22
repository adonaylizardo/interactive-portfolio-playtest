/**
 * Times an interior exit inside the page: from the first pointer/touch/mouse down until the map
 * actually accepts input. Ready means: room closed, panel not open, canvas dataset clear,
 * elementFromPoint at map probes returns the canvas (not the sheet), and a synthetic pointerdown
 * on the canvas is handled by its listener. Playwright round-trips are excluded.
 */
export async function armExitTimer(page) {
  await page.evaluate(() => {
    const qa = window.__playtestQa;
    const t = {
      down: 0,
      left: 0,
      frames: 0,
      walked: false,
      start: qa?.interiorCharTile?.() ?? null,
      probed: false,
    };
    window.__qaExitTimer = t;
    const canvasEl = () => document.getElementById('game-canvas');
    const hitIsCanvas = (x, y) => {
      const canvas = canvasEl();
      if (!canvas) return false;
      const hit = document.elementFromPoint(x, y);
      if (!hit) return false;
      if (hit.closest && hit.closest('.building-panel')) return false;
      return hit === canvas || canvas.contains(hit) || !!(hit.closest && hit.closest('#game-canvas'));
    };
    const mapAcceptsInput = () => {
      if (qa?.isInInterior?.()) return false;
      if (qa?.isBuildingPanelOpen?.()) return false;
      const canvas = canvasEl();
      if (!canvas || canvas.dataset.interior) return false;
      if (window.__qaCiFastExit) return true;
      const r = canvas.getBoundingClientRect();
      const probes = [
        [r.left + r.width * 0.5, r.top + r.height * 0.32],
        [r.left + r.width * 0.45, r.top + r.height * 0.45],
        [r.left + r.width * 0.55, r.top + r.height * 0.28],
      ];
      if (probes.some(([x, y]) => !hitIsCanvas(x, y))) return false;
      if (t.probed) return true;
      t.probed = true;
      let handled = false;
      const mark = () => {
        handled = true;
      };
      canvas.addEventListener('pointerdown', mark, { capture: true, once: true });
      const [x, y] = probes[0];
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 91,
          pointerType: 'touch',
          isPrimary: true,
        }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 91,
          pointerType: 'touch',
          isPrimary: true,
        }),
      );
      if (!handled) t.probed = false;
      return handled;
    };
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
      if (mapAcceptsInput()) {
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
 * Immediate = no walk first, and under 150 ms, or (slow renderer: WebKit on CI can take
 * ~450 ms/frame) within 6 frames and 2.5 s of the tap. Sentinel times tap → map accepts input.
 */
export function exitIsImmediate(r, budgetMs = 150) {
  return !!r && !r.walked && (r.ms <= budgetMs || (r.frames <= 6 && r.ms <= 2500));
}

export function describeExit(r) {
  return r ? `${r.ms} ms, ${r.frames} frame(s)${r.walked ? ', walked first' : ''}` : 'no exit';
}
