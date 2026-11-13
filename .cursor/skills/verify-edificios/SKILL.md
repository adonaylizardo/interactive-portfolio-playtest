---
name: verify-edificios
description: Run Playwright + pixel checks for Teatro Teresa Carreño (Talks) and Biblioteca (Writings) on the isometric portfolio map.
---

# Verify Teatro + Biblioteca

Run after map, sprite, panel, or van-parking changes touching `teresa` / `biblioteca`.

## Commands

```bash
npm run typecheck
npm run build
node scripts/import-teatro-biblioteca.mjs   # when forge pack assets changed
npm run verify:edificios
```

For a deployed candidate:

```bash
QA_BASE_URL=https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/ node scripts/verify-edificios.mjs
```

## What it checks

- Desktop 1280×800 and iPhone touch: walk enter + drive-to-door enter for both buildings
- Talks/Writings list → detail → exit
- Teresa `parkForDoor` parked footprint does not overlap footprint tiles 26–35 × 8–14
- Screenshots under `artifacts/verify-edificios/` compared to Pixel frames in `portfolio/talks-ui/` and `portfolio/writings-ui/` (>8% diff reported as mismatch)

## Deploy path

Build with base `/interactive-portfolio-playtest/preview-edificios/` only:

```bash
DEPLOY_TARGET=preview-edificios DEPLOY_GATE_PASSED=1 npx vite build --base /interactive-portfolio-playtest/preview-edificios/
node scripts/deploy-gh-pages.mjs --preview-edificios
```

Never deploy to `/preview/` (other agent) or live root.
