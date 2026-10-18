# Cámaras overview & door QA (c6)

Harness (fixed):

- Door-while-driving success requires **building panel or interior** from a **CDP touch only** (drive goals no longer count).
- Overview reports **covW** and **covH** separately; **limitingFill = min(covW, covH)** (bottleneck axis).

Local accept (Playwright + verify): `index-DUsehps8.js` @ `http://127.0.0.1:4175/.../preview-camaras/`

| Viewport | covW | covH | limiting axis | limiting fill | mapFullyVisible |
|----------|------|------|---------------|---------------|-----------------|
| 390×844  | see accept-report.json overviewResults | | | ≥90% | yes |
| 844×390  | | | | ≥90% | yes |
| 1280×800 | | | | ≥90% | yes |

Door tap while driving (cenital, 390): **5/5 ×2 rounds** — panel opens from cyan door touch (see `390-door-tap-log.json`).

Product fixes in this build: cenital door screen pick, immediate case/landmark preview on drive door tap, top-down overview (hide iso tiles), landscape view buttons while driving, 44px targets, dock view icons, intro subtitle dismiss, hidden Buscar, label/pill overlap QA.
