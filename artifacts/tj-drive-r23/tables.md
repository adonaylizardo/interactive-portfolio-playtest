# r23 sequential real-tap

local: http://127.0.0.1:4303/interactive-portfolio-playtest/preview/
hash: `index-MZISo_Ua.js`
probed: 2026-10-18T12:56–13:50Z, real taps/clicks only (no `driveEnter`).

## Root causes closed

### 1. 1280 first Estudio click after boarding

Desktop used Pixi `pointertap` only. After `seatInJac`, camera follow stayed engaged and damped, so pointerdown and pointerup landed on different display objects and `pointertap` never fired. Mouse was excluded from the pointerup deferred path.

Also: mouse pan started at 4 px, and `shouldBlockTap()` with slop 0 treated that as a drag.

Fix: mouse outdoor clicks fall through to `handleScreenTap` when Pixi did not claim the gesture; mouse slop is 10 px; follow only re-engages when the van is actually moving.

Proven on `index-MZISo_Ua.js`: first `page.mouse.click` after board accepted Estudio (5.6 s, sit ~29.8,38.8). Desk-1280 then finished the full visitor order.

### 2. Volaris preview close (× / Salir / Back)

Case houses open `showPreview` (by design). Close failed because:

- Salir (`data-exit`) called `leaveInteriorNow()` — a no-op while still on the map.
- CSS hid `.building-panel__exit` / `__close` in preview, so taps hit a 0×0 control.
- `closePreview()` was two-step (expanded → peek, then hide).
- The peek card slid `translateY(120%)→0` in 250 ms, so the ×/Salir box moved under the tap (software-GL made this look “flaky”).
- A leaked canvas click on the same building kept the sheet (`prepareMapTap` same-title abort).
- `hide()` then `history.back()` popped into an old interior and blocked reboard.

Fix: × / Salir / Escape / backdrop hide in one tap; visible Salir on the peek/read bars; leaked sheet clicks dismiss; sheet snaps in; ×/Salir `replaceState` the preview flag instead of `history.back()`.

Proven on `index-MZISo_Ua.js`: Volaris preview opened then closed at 390, 844, and 1280; Bain followed in the same session at all three widths.

### 3. 844 Catedral→Flor leftover (blocked sequential)

QA `frameDoorForQa` fitted van+door at zoom 0.057 on 844×390. The software-GL van crawled the Sambil corridor (~0.5 tile/s) and the 50 s wait expired mid-path at ~(48.7, 22.6). Pick at that zoom also marked `jac: true` on the Flor stoop.

Fix: floor QA framing at 0.18 (above the van-radius / body-hit threshold) and restore a playable follow zoom after the real tap. Flor then entered in 11.5 s from the Catedral sit in a diagnostic, and in the sequential sessions.

## Sequential visitor order (one session per width)

| width | estudio | volaris | bain | mentoria | finoa | pg | sambil | catedral | flor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| phone-390 | OK 21.2s | OK 10.1s preview | OK 2.4s | OK 0.7s | OK 2.5s | OK 1.1s | OK 30.2s | OK 15.4s | OK 11.2s |
| land-844 | OK 6.8s | OK 8.9s preview | OK 16.9s | OK 2.0s | OK 1.4s | OK 1.9s | OK 26.8s | OK 9.9s | OK 48.0s |
| desk-1280 | OK 5.6s | OK 3.8s preview | OK 4.5s | OK 1.7s | OK 1.8s | OK 1.4s | OK 6.8s | OK 7.2s | OK 11.8s |

1280 first Estudio after board: one mouse click. Volaris→close→Bain in the same session at all three widths.

## Retarget 4 pairs × 3

| pair | 390 | 844 | 1280 |
| --- | --- | --- | --- |
| sambil→finoa | 3/3 | 2/3 (#1 hit Estudio) | 3/3 |
| sambil→mentoria | 1/3 then to-tap-miss | 2/3 then to-tap-miss | 3/3 |
| flor→volaris | 1/3 then reboard | 1/3 then reboard | 3/3 |
| estudio→pg | reboard after Volaris | reboard after Volaris | 3/3 |

1280: 12/12. Phone/landscape late-session reboard after a later Volaris preview still fails (first Volaris→Bain in the visitor order does not).

## Ground 5 taps

| tile | 390 | 844 | 1280 |
| --- | --- | --- | --- |
| (46,20) | skipped (reboard) | skipped (reboard) | OK 0.98× |
| (24,27) | skipped | skipped | OK 0.97× |
| (37,26) | skipped | skipped | OK 0.98× |
| (44,36) | skipped | skipped | OK 0.98× |
| (18,36) | skipped | skipped | OK 0.99× |

1280: 5/5, all ≤1.5×.

## Leftovers (not the two asked items)

- Phone/landscape retarget after a later Volaris close: `boardVan` misses for the rest of that session. Sequential Volaris→Bain still works.
- 844 Flor sequential is slow (48 s) but enters. Path still goes Catedral → east via Sambil → south.

## Hashes

| bundle | used for |
| --- | --- |
| `index-MZISo_Ua.js` | all three sequential sessions; deploy candidate |
