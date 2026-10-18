# r24 gates

base: https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/
hash: **index-C8PhVCwb.js**
source: real CDP touch at 390 / 844×390, real mouse at 1280. Read-only hooks only.
No frameDoorForQa / driveEnter / jacSet / setLayout / jacGetIn.

## HIGH-1 north Volaris (spawn approach) — PASS all three widths

Adonay left on the Volaris door after preview; map input recovered; one real tap reboarded in well under 3 s, then Bain opened.

| width | sit (van) | char after close | × | Salir | Escape | backdrop | reboard |
|---|---|---|---|---|---|---|---|
| 390×844 | (37.45, 35.90) | (39, 36) | 1 ms / 249 ms | 0 / 232 | 3 / 246 | 1 / 252 | all ≤252 ms |
| 844×390 | (37.62, 36.06) | (39, 36) | 1 / 259 | 1 / 261 | 3 / 244 | 5 / 248 | all ≤261 ms |
| 1280×800 | (38.14, 36.28) | (37, 34) | 1 / 149 | 6 / 143 | 1 / 147 | 4 / 146 | all ≤149 ms |

vanOverlap=false, walkGoal empty (backdrop close starts a ground walk, then seat clears it). Same dead sit r23 reported (~37.9, 36.1) with Adonay on (39, 36).

Earlier live north dump on the same hash: sit (38.06, 36.23), afterClose vanOverlap=false char (37, 34), reboard 201 ms, Bain 2682 ms.

## MED-2 landscape backdrop

North 844 backdrop close 5 ms, then van tap 248 ms. The map/backdrop tap is what closed the peek card.

## LOW-3 walk cue

Board toast `Caminando a la T9…` on the live north dump (visible for the ~7.3 s walk). Hidden on seat.

## Visitor order

| width | doors |
|---|---|
| 390×844 | **9/9** estudio → volaris → bain → mentoria → finoa → pg → sambil → catedral → flor |
| 844×390 | 8/9 through sambil; catedral door was off-canvas (y≈−22) after sambil — probe now aims the nudge along the van→door vector |
| 1280 | skipped here; r23 already 9/9 on this stack |

## South (Estudio → Volaris)

| width | first Volaris after Estudio | × close → reboard → Bain | later closes |
|---|---|---|---|
| 390 | (37.71, 36.01) char (40, 36) | OK 253 ms | Salir reopen Volaris timed out at (40.89, 38.52) — parked-near retap added |
| 844 | (34.04, 35.76) char (39, 36) | reboard 495 ms, Bain timed out at (40.51, 27.06) next to Bain door | same retap |
| 1280 | board flake on the south-only page | — | boardVan now pinches if the first taps miss |

## Root

`index-CoabCvDQ.js` untouched.
