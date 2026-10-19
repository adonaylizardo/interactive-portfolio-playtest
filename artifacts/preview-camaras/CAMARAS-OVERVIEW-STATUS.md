# Cámaras overview task status (separate from persona DyFqE_zI QA)

**Branch:** `cursor/top-down-cenital-f7e1`  
**Live URL:** https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/

## Served bundle (verified 2026-10-18)

| Source | Hash |
|--------|------|
| `adonaylizardo.github.io/.../preview-camaras/` | **`index-DEFVa1HK.js`** |
| `gh-pages` raw `preview-camaras/index.html` | **`index-DEFVa1HK.js`** |

Prior Forge bundle `index-BdWCf4Jg.js` / local verify `index-DibKUor4.js` are superseded.

## Phone overview fill (limiting axis)

Acceptance target: **≥90%** on the limiting axis, full map visible, label declutter.

| Viewport | Limiting axis | Fill | Status |
|----------|---------------|------|--------|
| **390×844** | width | **100%** | Pass (portrait binds on width; height ~79% — expected for map aspect) |
| **844×390** | height | **100%** | Pass (landscape binds on height) |
| **1280×800** | width | **100%** | Pass |

Evidence: `390-overview.png`, `844x390-overview.png`, `1280-overview.png`, `accept-report.json` on branch `cursor/top-down-cenital-f7e1`.  
Older `artifacts/preview-camaras/report.json` (50% height on 390) reflects **pre-fix** verify — do not use for sign-off.

## Map button / overview entry

Cenital overview via map control and dock view buttons — covered in `verify-preview-camaras.mjs` (dock isometric view button on 1280, overview toggle).

## Label declutter

Cenital building labels: **0 overlaps** in overview accept run on 390 / 844×390 / 1280.

## Door tap while driving (390, CDP touch)

**5/5 pass** — buildings: estudio, sambil, flor, mentoría, volaris.  
Log: `390-door-tap-log.json` (regenerate with `node scripts/accept-preview-camaras.mjs <url> index-DEFVa1HK.js`).

## Commands

```bash
QA_GL=llvmpipe node scripts/verify-preview-camaras.mjs \
  https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/

QA_GL=llvmpipe node scripts/accept-preview-camaras.mjs \
  https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/ \
  index-DEFVa1HK.js
```

**Note:** Persona work stays on `cursor/persona-camaras`; cámaras overview fixes live on `cursor/top-down-cenital-f7e1` and are already deployed to `/preview-camaras/` only.
