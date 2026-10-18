# r24 gates — deployed `/preview/`

base: https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/
hash: **index-C8PhVCwb.js**
root (untouched): index-CoabCvDQ.js

Real CDP touch at 390×844 and 844×390, real mouse at 1280.
Read-only hooks only. No frameDoorForQa / driveEnter / jacSet / setLayout / jacGetIn.

## HIGH-1 north Volaris (spawn) — PASS 3/3 widths

Same dead sit r23 reported. After close, Adonay is on the door; one real tap reboards in well under 3 s; Bain opens.

| width | sit (van) | char | × | Salir | Escape | backdrop |
|---|---|---|---|---|---|---|
| 390×844 | (37.45, 35.90) | (39, 36) | 1 / 249 ms | 0 / 232 | 3 / 246 | 1 / 252 |
| 844×390 | (37.62, 36.06) | (39, 36) | 1 / 259 | 1 / 261 | 3 / 244 | 5 / 248 |
| 1280×800 | (38.14, 36.28) | (37, 34) | 1 / 149 | 6 / 143 | 1 / 147 | 4 / 146 |

vanOverlap=false after close. Pointer/touch still reach the canvas; pinch still works. Reload is no longer required.

Verbose live north dump on this hash: sit (38.06, 36.23), afterClose char (37, 34), reboard 201 ms, Bain 2682 ms.

## HIGH-1 south Volaris (Estudio → Volaris) — PASS 3/3 widths

| width | first south sit | × | Salir | Escape | backdrop |
|---|---|---|---|---|---|
| 390×844 | **(37.92, 40.12)** char (39, 36) | 2 / 239 ms | 1 / 233 | 1 / 234 | 1 / 269 |
| 844×390 | (34.02, 35.76) char (39, 36) | 1 / 544 | 1 / 239 | 0 / 485 | 2 / 283 |
| 1280×800 | (36.28, 36.28) char (39, 36) | 0 / 145 | 1 / 142 | 1 / 161 | 2 / 151 |

390 south sit is the r23-surviving south park (~38.66, 39.48). Reboard after every close method is ≤544 ms, then Bain.

## MED-2 landscape backdrop

844 north backdrop close 5 ms, van tap 248 ms. Map/backdrop tap is what closed the peek card (elementFromPoint on the canvas above the sheet).

## LOW-3 walk cue

Live board shows toast `Caminando a la T9…` for the ~7.3 s walk; hidden on seat.

## Visitor order

| width | result |
|---|---|
| 390×844 | **9/9** estudio → volaris → bain → mentoria → finoa → pg → sambil → catedral → flor |
| 844×390 | **8/9** through catedral (panel `Catedral` at (14.2, 19.9)); Flor door then sits at y≈1447 on the 390-tall viewport after the interior camera — harness limit, not the HIGH-1 input lock |
| 1280 | skipped this round; r23 already 9/9 on this stack |

## Root cause (not a parking-spot special case)

`enterBuildingFromDoor` leaves Adonay on the door tile. A north Volaris sit puts that door inside the parked 5×3. `vanWalkBlock` then made every later walk start from a blocked island (no passable neighbor). South sits leave the door outside the hull.

General fix in `src/game/scene.ts`:
- never cage the tile the walker is standing on
- hull occupancy counts as at the van
- preview close clears leftover door-walk / walkGoal and rescues off the hull
- `seatInJac` clears walkGoal
