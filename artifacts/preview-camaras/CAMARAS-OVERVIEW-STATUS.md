# Cámaras overview & door QA (c6)

Harness (fixed):

- Door-while-driving success requires **building panel or interior** from a **CDP touch only** (drive goals no longer count).
- Overview reports **covW** and **covH** separately; **limitingFill = min(covW, covH)** (bottleneck axis).

Live bundle (gh-pages): **`index-BZ3ODSr2.js`** — confirm with cache-busted fetch (`?nocache=<ts>`); raw `gh-pages` HTML matches; CDN may lag minutes.

Local accept (Playwright + verify): **`index-BZ3ODSr2.js`**

| Viewport | covW | covH | limiting fill | mapFullyVisible | label overlaps |
|----------|------|------|---------------|-----------------|----------------|
| 390×844  | 100% | 100% | 100% (height) | yes | 0 |
| 844×390  | 100% | 100% | 100% (height) | yes | 0 |
| 1280×800 | 100% | 100% | 100% (height) | yes | 0 |

Door tap while driving (cenital, 390): **5/5 ×2 rounds** — panel opens from cyan door touch (see `390-door-tap-log.json`).

Product fixes in this build: cenital door screen pick, immediate case/landmark preview on drive door tap, top-down overview (hide iso tiles), landscape view buttons while driving, 44px targets, dock view icons, intro subtitle dismiss, hidden Buscar, label/pill overlap QA.
