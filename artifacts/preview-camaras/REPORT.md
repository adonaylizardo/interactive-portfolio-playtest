# preview-camaras acceptance (live)

**URL:** https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/  
**Verified live bundle:** `index-DEFVa1HK.js` (matches `gh-pages` raw `index.html`)  
**Branch:** `cursor/top-down-cenital-f7e1`  
**When:** 2026-10-18

## Overview (limiting axis ≥90%, full map visible)

| Viewport | Limiting axis | Fill | mapFullyVisible | Labels overlaps |
|----------|---------------|------|-----------------|-----------------|
| 390×844 | width | 100% | yes | 0 |
| 844×390 | height | 100% | yes | 0 |
| 1280×800 | width | 100% | yes | 0 |

Limiting axis = whichever dimension fills the chrome-aware free rect more (map aspect cannot fill both). Portrait phone uses width; wide desktop binds on width at 1280×800 so height stays ~79% with no crop.

Screenshots: `390-overview.png`, `844x390-overview.png`, `1280-overview.png`, plus `*-overview-accept.png` from accept run.

## Door tap while driving (390, CDP touch)

**5/5 pass** — log: `390-door-tap-log.json` (estudio, sambil, flor, mentoría, volaris).

## c3 regressions

`verify-preview-camaras.mjs` against live URL: **exit 0** (see `verify-accept-run.log`).

## Commands

```bash
QA_GL=llvmpipe node scripts/accept-preview-camaras.mjs \
  https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/ \
  index-DEFVa1HK.js
```

Full machine-readable report: `accept-report.json`.
