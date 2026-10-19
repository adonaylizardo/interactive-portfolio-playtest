# preview-persona acceptance report

**URL:** https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/  
**Final bundle (gh-pages raw):** `index-BMoeR2yr.js`  
**Harness:** `scripts/accept-preview-persona.mjs` — Playwright Chromium, `navigator.webdriver` hidden, `QA_GL=llvmpipe`, real CDP touch (390×844, 844×390) and mouse/keys (1280×800).

## Result summary

| Viewport | Status | Notes |
|----------|--------|--------|
| 390×844 | **PASS** | All criteria green in final run |
| 844×390 | **PASS** | FPS ratio ≥0.8 after persona idle sync + landscape subir clearance |
| 1280×800 | **PASS** | Walks, yaw, FPS, cabin Frame B checks |

Evidence JSON: `artifacts/preview-persona/accept-report.json`  
Console log: `artifacts/preview-persona/accept-run-local3.log` (and final green run on `index-BMoeR2yr.js`).

## Criteria evidence

1. **Yaw (3s D hold)** — `390-yaw-log-d.json`, `844x390-yaw-log-d.json`, `1280-yaw-log-d.json`: monotonic `yawRad`, no quarter backtrack oscillation.
2. **Pantone after walk+turn** — `390-pantone-after-walk-turn.png`, `1280-pantone-after-walk-turn.png`.
3. **Catedral / Flor <30s, no interior** — `walkCatedral` / `walkFlor` in `accept-report.json`; `390-interior-log.json` (empty = zero accidental entries).
4. **Frame C vs build** — `390-vs-frame-c.png`, `1280-vs-frame-c.png`; asset keys include `jac-t9-ext`, lamps, tree, bench.
5. **FPS persona ≥80% map** — per-viewport `fps` block in `accept-report.json` (same session: iso map sample then persona after enter).
6. **No map UI leak** — `uiFoot` + `1280-cabin-frame-b.png` (single Bajar, no jac-hud/rear).
7. **Subir clearance** — checked at JAC door tile; mobile portrait/landscape pass with updated `.persona-jac-board` offsets.

## CDN note

GitHub Pages CDN lagged behind `gh-pages` for ~20+ minutes during this run; acceptance was validated on a local static mirror of the same bundle as raw `gh-pages` before CDN caught up. Re-fetch `index.html` on the live URL and confirm script hash matches `index-BMoeR2yr.js`.
