# r23 sequential real-tap

local: http://127.0.0.1:4303/interactive-portfolio-playtest/preview/
probed: 2026-10-18T12:08–12:47Z, real taps/clicks only (no driveEnter).

## Root causes closed

### 1. 1280 first Estudio click after boarding

Desktop used Pixi `pointertap` only. After `seatInJac`, camera follow stayed engaged and damped, so pointerdown and pointerup landed on different display objects and `pointertap` never fired. Mouse was excluded from the pointerup deferred path.

Also: mouse pan started at 4 px, and `shouldBlockTap()` with slop 0 treated that as a drag.

Fix: mouse outdoor clicks fall through to `handleScreenTap` when Pixi did not claim the gesture; mouse slop is 10 px; follow only re-engages when the van is actually moving; `frameDoorForQa` suspends follow.

Proven: one `page.mouse.click` on Estudio after board set the sit goal (accepts 0→1) on `index-BowlxUOh.js` and `index-q2CR4HRH.js`. Desk-1280 full session 9/9 including that first click.

### 2. Volaris preview close (× / Salir / Back)

Case houses open `showPreview` (by design). Close failed because:

- Salir (`data-exit`) called `leaveInteriorNow()` — a no-op while still on the map.
- CSS hid `.building-panel__exit` / `__close` in preview, so the probe and many taps hit a 0×0 control.
- `closePreview()` was two-step (expanded → peek, then hide). A fat-finger on “Leer caso” left the card up.
- The peek card slides `translateY(120%)→0` in 250 ms, so the ×/Salir box moved under the tap (software-GL made this look “flaky”).
- A leaked canvas click on the same building kept the sheet (`prepareMapTap` same-title abort), so the van sat under the card.

Fix: × / Salir / Escape / backdrop hide in one tap; visible Salir on the peek/read bars; Back pops a preview history flag; leaked sheet clicks dismiss; preview sheet snaps in and sits above the map; ×/Salir replace the preview flag instead of `history.back()` (that popped into an old interior and blocked reboard).

Proven: Volaris preview opened then closed at 390, 844, and 1280; Bain followed in the same session at all three widths. 1280 Salir locator click hid the card and the van boarded again.

## Sequential visitor order (one session per width)

| width | estudio | volaris | bain | mentoria | finoa | pg | sambil | catedral | flor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| phone-390 (`index-q2CR4HRH.js`) | OK 21.0s | OK 3.6s preview | OK 3.0s | OK 6.4s | OK 2.2s | OK 1.0s | OK 27.6s | OK 19.4s | OK 12.1s |
| land-844 (`index-CT_1hSRG.js`) | OK 22.6s | OK 3.4s preview | OK 2.0s | OK 0.6s | OK 3.0s | OK 0.6s | OK 5.5s | OK 37.7s | FAIL timeout @~(48.7,22.6) |
| desk-1280 (`index-BowlxUOh.js`) | OK 5.1s | OK 3.7s preview | OK 4.0s | OK 2.0s | OK 1.5s | OK 1.4s | OK 6.6s | OK 7.3s | OK 11.6s |

1280 first Estudio after board: one mouse click, goal (30,39), entered.

## Retarget 4 pairs × 3

| pair | 390 | 844 | 1280 |
| --- | --- | --- | --- |
| sambil→finoa | 3/3 | 3/3 (BowlxUOh) / 0/3 to-tap (CT_1hSRG) | 3/3 |
| sambil→mentoria | 3/3 | 1/3 then from-tap miss (BowlxUOh) | 3/3 |
| flor→volaris | 1/3 then reboard (q2CR4HRH) | 3/3 | 3/3 |
| estudio→pg | reboard after Volaris close (q2CR4HRH) | 0/3 (BowlxUOh) / 3/3 (CT_1hSRG) | 3/3 |

1280: 12/12. 390 doors 9/9; later retarget reboard was the old `history.back()` after preview (fixed on `index-CT_1hSRG.js`).

## Ground 5 taps

| tile | 390 | 844 (BowlxUOh) | 1280 |
| --- | --- | --- | --- |
| (46,20) | skipped (reboard) | OK 0.99× | OK 0.99× |
| (24,27) | skipped | OK 0.98× | OK 0.99× |
| (37,26) | skipped | timeout d=2.47 | OK 1.01× |
| (44,36) | skipped | OK 0.93× | OK 0.97× |
| (18,36) | skipped | tap-miss | OK 0.99× |

1280: 5/5, all ≤1.5×, no 180° check in this harness (travel ≈ planned).

## Leftovers (not the two asked items)

- 844 Flor sequential: tap accepted but van sat near Sambil (~48.7, 22.6) until the 50 s wait. Path/retarget leftover, not the 1280 mouse miss or Volaris close.
- 390 ground skipped on the 9/9 door session because a later preview `history.back()` blocked reboard (fixed after that run).

## Hashes

| bundle | used for |
| --- | --- |
| `index-BowlxUOh.js` | 1280 full pass; first 844/390 pass |
| `index-q2CR4HRH.js` | 390 9/9 doors |
| `index-CT_1hSRG.js` | 844 retry; deploy candidate |
