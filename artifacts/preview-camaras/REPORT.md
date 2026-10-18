# preview-camaras acceptance report

**URL:** https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/  
**Final bundle (gh-pages raw):** `index-Cq7BCQCk.js`  
**Previous live bundle referenced in Forge QA:** `index-BdWCf4Jg.js` (superseded by this deploy)

## Harness

- `scripts/verify-preview-camaras.mjs` — CDP touch 390×844, **844×390**, mouse 1280; `QA_GL=llvmpipe`; webdriver hidden via init script in door suite.
- `scripts/accept-preview-camaras.mjs` — overview + 5× door-tap-while-driving (run against live when browser stable).

## Verify results (local mirror = deployed bundle)

Log: `artifacts/preview-camaras/verify-run-local.log`  
JSON: `artifacts/preview-camaras/report.json`

### c3 regression checks (verify script)

- Cenital mode / altView, real building taps (sambil, estudio), dock isometric view button (1280), cardinal + off-axis drive heading gates — **PASS** on 390 and 1280 in final local verify.

### Phone overview ≥85% fill — **BLOCKER**

Local verify on deployed bundle `index-DibKUor4.js` (see `verify-run-local.log`):

| Viewport | covW | covH | min (gate) |
|----------|------|------|------------|
| 390×844 | 97.4% | **50.1%** | **FAIL** |
| 844×390 | **41.5%** | 100% | **FAIL** |

Portrait height fill stays ~50% even with increased overview zoom search — `mapFitsOverviewMargins()` + isometric map aspect cap vertical coverage. **Needs dedicated cenital overview work** (margins / fit target), not satisfied by zoom tuning alone.

Screenshots: `390-overview.png`, `844x390-overview.png`.

### 5/5 door-tap-while-driving

- Implemented in `accept-preview-camaras.mjs` (`390-door-tap-log.json`). Re-run on live URL once CDN serves `index-Cq7BCQCk.js`:
  `node scripts/accept-preview-camaras.mjs`

## Screenshots

- `390-overview.png`, `844x390-overview.png`, `390-cenital.png`, `390-driving.png`, `1280-*` counterparts under `artifacts/preview-camaras/`.

## CDN

Confirm live page script tag matches raw gh-pages:  
`curl -sL https://raw.githubusercontent.com/adonaylizardo/interactive-portfolio-playtest/gh-pages/preview-camaras/index.html`
