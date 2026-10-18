# Persona round-3 evidence (no deploy)

- **URL:** http://127.0.0.1:4178/interactive-portfolio-playtest/preview-persona/
- **Bundle observed:** `index-BVTvOfSJ.js`

## FPS (persona / map, same session)

- **390:** map 12.4 → persona 7.0 (**ratio 0.57** ✗)
- **844x390:** map 15.4 → persona 8.4 (**ratio 0.55** ✗)
- **1280:** map 6.2 → persona 3.6 (**ratio 0.58** ✗)

## UI leak

- **390:** name labels 0, cenital labels 0 ✓
- **844x390:** name labels 0, cenital labels 0 ✓
- **1280:** name labels 0, cenital labels 0 ✓

## Frame side-by-sides

- **390:** frame-C meanDiff 17.7; frame-B 17.3
- **844x390:** frame-C meanDiff 17.9; frame-B 19.8
- **1280:** frame-C meanDiff 14.3; frame-B 13.9

## Adonay scale / landscape

- **390:** adonayH 338px (expected ~338) ✓; feetY 826 legsClear ✓; subtitle hidden landscape via CSS
- **844x390:** adonayH 156px (expected ~156) ✓; feetY 326 legsClear ✓; subtitle hidden landscape via CSS
- **1280:** adonayH 320px (expected ~320) ✓; feetY 783 legsClear ✓; subtitle hidden landscape via CSS

## Nav/board overlap

- **390:** jacBoard over dock clear ✓
- **844x390:** jacBoard over dock clear ✓
- **1280:** jacBoard over dock clear ✓

## Facade sharpness (edge probe)

- **390:** edge 0 ✗
- **844x390:** edge 0 ✗
- **1280:** edge 0 ✗
