# r45k: Jac T9 truck driving fix. Spec for the cloud agent, FINAL (hybrid of variant B) (paste as-is)

**Repo** `adonaylizardo/interactive-portfolio-playtest`, PR #20.
**Start from** `cursor/integracion` @ `5a265621` (r45j). Work and push **only** on `cursor/integracion`.
**Gate branch** `qa/forge-gates-r45j` (Forge; Sentinel CAMBIOS applied, then the r45k ruling amendments G-A..G-D — see §6).

## 0. Rules (non-negotiable)
- Commits are authored `Adonay Lizardo <adolizardo@gmail.com>` (`git -c user.name="Adonay Lizardo" -c user.email="adolizardo@gmail.com" commit …`).
- Push only to `cursor/integracion`. No gh-pages, no merge to main, no root deploy, no new PRs, no comments or messages to anyone.
- Never commit screenshots, videos, `dist/` or QA output. Keep them in `/tmp`.
- **Frozen paths. Your final diff against `5a265621` must be empty for:**
  - `src/data/**` (map, props, cells, doors, park sites);
  - the QA hooks `qaSpawnDrive`, `qaPlace`, `snapshot` and `window.__playtestQa` (signatures and behaviour). **One allowed exception: H-1 in §6** (`reverseCue` in `snapshot()`), which you must make;
  - `scripts/qa/**` **except** the exact contents brought in from `origin/qa/forge-gates-r45j` in §1. After your last commit, `git diff origin/qa/forge-gates-r45j -- scripts/qa` must be empty and `git diff 5a265621 -- src/data` must be empty. Forge checks both.
- **Gates are Forge's.** You do not edit any gate: no thresholds, metrics, sampling, axes, inputs or test coordinates. That includes G10: its site is already fixed by Forge in `scripts/qa/drive-real.mjs` (reverse in closed loop until cx ≤ 16.3 on the y≈6 street, then 0.5 s straight + 2.8 s full steer; judged by G-E, §6). If you believe a gate is wrong, stop and say so in the PR body with numbers. Do not change it.
  - Note: the r45j fix agent edited `scripts/qa/sentinel-r45h/honest.mjs` and `h3b.mjs` (moved the axis to the end-of-frame sprite, which made the velocity check tautological). That edit is **reverted** on the gate branch. Doing anything like it again fails the round.
- Collision in the gates is judged by an **independent oracle** (`scripts/qa/forge/oracle.mjs` + `frozen-drive-grid.json`, frozen from `5a265621` `src/data`), not by `poseBlocked`. The `oracle` check also fails if the build's walkable grid or `poseBlocked` disagree with it.
- Do not force the reported `vel` or the HUD to satisfy a gate. The HUD is checked against the truck's **real** frame displacement.
- **Pasted output does not count.** Paste it anyway (§4), but Forge or Sentinel re-run `run-all.mjs` and the browser gates on your pushed commit outside the agent. Their result is the verdict.
- One new public getter is required on `JacT9`: `get reverseCue(): boolean`, true while the HUD shows the "R" cue (see the D1 rule). It is not a QA hook; it must reflect what the player sees.

## 1. First step: bring in the cumulative gate
```
git fetch origin
git checkout origin/qa/forge-gates-r45j -- scripts/qa        # exact copy; do NOT hand-merge
git diff --stat origin/qa/forge-gates-r45j -- scripts/qa     # must print nothing
git -c user.name="Adonay Lizardo" -c user.email="adolizardo@gmail.com" commit -m "qa: bring in r45k cumulative gate (qa/forge-gates-r45j)"
npm ci && node scripts/qa/forge/run-all.mjs --jobs 6         # baseline: must FAIL on 5a265621 as below
```
`run-all.mjs` runs 19 checks: 17 at dt 1/60, 0.1 and 0.25, plus `oracle` once and `vardt` on a seeded 16/33/250 ms sequence = 53 cells, and exits 0 only if every cell passes. Your job is to make it exit 0 **without touching it**.

On `5a265621` the runner exits 1 with **31/53 cells failing**:

| check | dt 0.0166667 | dt 0.1 | dt 0.25 | once | var |
|---|---|---|---|---|---|
| oracle | - | - | - | PASS | - |
| ov | PASS | PASS | PASS | - | - |
| h1 | PASS | PASS | PASS | - | - |
| h3b | PASS | FAIL(2) | FAIL(4) | - | - |
| honest | PASS | PASS | PASS | - | - |
| park | FAIL(10) | FAIL(10) | FAIL(11) | - | - |
| turn | FAIL(6) | FAIL(6) | FAIL(6) | - | - |
| partial | FAIL(6) | FAIL(5) | FAIL(5) | - | - |
| swapq | PASS | PASS | PASS | - | - |
| monkey | FAIL(8) | FAIL(10) | FAIL(10) | - | - |
| vardt | - | - | - | - | FAIL(9) |
| esc2 | PASS | PASS | PASS | - | - |
| escsteer | FAIL(6) | FAIL(6) | FAIL(6) | - | - |
| trap | PASS | PASS | FAIL(2) | - | - |
| shuttle | FAIL(8) | FAIL(8) | FAIL(8) | - | - |
| edge | FAIL(5) | FAIL(4) | FAIL(4) | - | - |
| borders | FAIL(6) | FAIL(5) | FAIL(5) | - | - |
| rmirror | FAIL(5) | FAIL(5) | FAIL(4) | - | - |
| brakesteer | PASS | PASS | PASS | - | - |

RESULT: FAIL — 31/53 cells fail

Reference outputs (qa branch): `scripts/qa/forge/r45j/runall-v2-r45j-5a265621.txt`, `runall-v2-r45i-6450f1f.txt`, `runall-v2-r45h-d2bd630-honest.txt`.

What the baseline catches on r45j: HIGH-1 (`shuttle` porch 66/148, cactus 59/132; backward runs in D up to 6.1 t), HIGH-2 (`edge`, `borders`: vel +4.3 → −8.2 at the borders, backward 3.0–3.2 t), the same back-up mirrored in R (`rmirror`: forward run with R gas 4.1 t), frame jumps up to 0.30 t, heading 130° off the sprite, swaps after <0.1 t / illegal in-place swaps (`monkey`, `vardt`), low-FPS dead stops and shuttles (`h3b` at 0.1/0.25), the low-FPS trap at (17.8, 19) (`trap` 0.25), and park sites 4.38/4.34 t from the Bain/Volaris doors (nearest reachable 3.16/1.96 t). `escsteer` fails on the monitor (back-up in D), not on needs-R.

The same runner on r45i (`6450f1f`) fails 37/53 cells: HIGH-A (`turn` turn90b 68–77 % on arc-legal poses, G10 85.2 % at dt 0.25, 5747 snaps at give-up), HIGH-B (`swapq` 0.35 q beyond plain yaw, speed 0 at the swap), MED-1 (`escsteer` needs R in 42/75/35 %, R cue 0 %, trapped 14+7), dead stops 148/148 (`h3b`), (23,7) 2.25 s at dt 0.25.


## 2. Root causes (Sentinel r45h REVIEW + Forge r45j QA + Sentinel r45k plan review)
| ID | Symptom | Root cause |
|---|---|---|
| **HIGH-1 (r45j)**, return of r45h HIGH-3 | Gas+steer into a prop: crawl ≈2.7 s, then **reverse at −2.2 t/s in D with gas held** for up to 2 t, repeat. Shuttle porch 66/148, cactus 59/132 | `stepManual` `pinAnchor` back-up (`jacT9.ts` ≈3110–3155) |
| **HIGH-2 (r45j)** | Plain left turn into the top edge (and every border): vel +4.8 → −2.2 in one frame, backs 1.6–3 t in D | the same back-up plus `escapeBreakout`/`breakoutStep` |
| MED (r45j) | One-frame jumps 0.30–0.38 t at 1/60; ≈150 % of top speed at low FPS | swap "best hop" relocation (≈3024–3050) and `longFrame` creepCap |
| MED (r45j) | Heading up to 130° off the sprite, also at rest | `walkPinHeading`, pin yaw, and the soft caps `HEADING_CAP+0.05` (60.5°, ≈3424) and `0.5+SWAP_HYST+0.2` (74°, ≈4175) |
| MED (r45j) | Sprite swaps after <0.1 t, or in place where the rotated box does not fit | `DIR_TRAVEL_MIN` bypassed by escape/hop paths |
| MED (r45j), FPS | Dead stops / shuttles / traps only at dt 0.1–0.25 | timers in wall-clock time (`escapeBreakout`, `slowSteerT`, `longFrame`) |
| MED (r45j) | (22,18) toast 891/943 ms (r45h: 95/410 ms) | slow no-route detection in tap-park |
| r45i HIGH-A / HIGH-B / MED-1 (keep fixed) | 90° snap + stop when steering at speed; 33° swap jump + one-frame stop; steering out needs R in 42 % | `giveUpEscape` on open road; swap re-pose; no escape rule |
| r45i edge "earn travel" | backs 0.45 t at the borders (208/416 runs) | must not come back either |
| r45h fixed items (keep) | straight-gas auto-yaw, impact slide, overlap at low FPS, Bain/Volaris arrival, false speedometer | Sentinel r45h REVIEW §1 A–F |

## 3. Behaviour rules (both variants)
These rules are what the gate enforces. Each line names the check.

**D1. Blocked nose (escape) rule** (Sentinel r45k, exact):
> With the nose blocked and gas+steer in D (in R, mirrored):
> - The heading turns with the steering at CREEP_YAW, capped at ±0.62 q from the sprite.
> - When the heading crosses the swap line, the sprite changes **in place** only if all three hold:
>   1. the rotated box fits at the current pose (oracle-legal, no translation);
>   2. ≥0.1 t has been travelled since the last sprite change;
>   3. ≥1.0 t is free ahead along the new facet.
> - If it does not fit on the steering side, the other side is not tried unless the player steers that way.
> - If it does not fit: vel 0, no translation, and the **"R" cue** is shown next to the steering cue (`reverseCue === true`). Never any backward movement in D (≤0.1 t settle, never behind the frame start). No automatic manoeuvre.
> - In R the player reverses freely. Back in D the same rule applies.

Gate `escsteer` (amended G-C, see §6): stuck cases (6 s gas+steer into porch/cactus, <0.5 t in the last 3 s) → steer the other way/straight in D. **needs-R is justified only where D1 forbids every in-place swap** (`needRUnjustified` 0: no neighbour facet that fits with ≥1 t free and ≥0.1 t since the last real sprite change); R cue in **100 %** of needs-R cases; trapped 0 (the battery includes R). The needs-R share is information only.

**Movement rules (all checks, every dt; monitor = turn, partial, monkey, vardt, esc*, trap, shuttle, edge, borders, rmirror, brakesteer):**
1. No backward motion in D with gas: longest backward run ≤0.1 t, and no frame ends >0.05 t behind its start against the gear (`backDMaxRun`, `behind`). No vel flip >+1 → <−0.5 (`flips` 0). R is the exact mirror (`rmirror`: no forward run with R gas, `rFlips` 0).
2. Heading within **0.62 q (56°)** of the sprite on every frame, moving or at rest (`offSprite`, `restOffSprite`). Delete the 60.5° and 74° soft caps.
3. No sprite jump >0.5 q beyond the plain frame yaw (`snapX` 0 at every dt); dt-scaled `snap04` 0; swap frame ≤0.1 q beyond plain yaw, speed ratio 0.85–1.2 (`swapq`).
4. Sprite changes need ≥0.1 t travelled since the last change (`shortSwap` 0) and, in place, a fitting rotated box and ≥1 t free (`inPlaceBad` 0).
5. Frame displacement ≤1.1·TOP·dt + 0.05 t (`jumps` 0). No lateral relocation on swap (`h1 swapLat` ≤0.05).
6. Never overlap a blocked cell or prop at the end of a frame (oracle; `ov`, `honest`, all monitors).
7. HUD mph equals the mph of the real displacement (±1) in ≥99 % of frames (`honest`, `h3b`, park routes). No motion >35° off **both** the pre-frame and end-of-frame sprite (`honest` wide35Both 0).
8. Shuttles (amended G-B): 0 runs boxed in 1.5 t for 3 s that go back and forth (path − net ≥0.5 t) while gas is held (`h3b`, `shuttle`). Dead stops (amended G-A): 0 stretches ≥0.5 s still, not yawing and without the R cue, and 0 stretches ≥1.0 s still without the R cue even while yawing; R cue never shown ≥0.3 s where D1 allows the in-place swap to the steering side (`cueUnjustified` 0) (`h3b`).
9. Turn at speed: G10 and turn90b **≥98 % on the 6393 arc-legal poses at every dt** (all-pose figures are information). 0 snaps at give-up, 0 hard stops (`turn`).
10. Partial steering ±0.25/0.5/0.707/0.9 on arc-legal poses: same monitor rules; left/right turn completion symmetric within 3 points for |steer| ≥0.5 (`partial`).
11. Brake+steer at rest (D and R): heading stays within 0.62 q of the sprite and every monitor rule holds (`brakesteer`).
12. Every map border and corner, steer −1..1, 6 s; the y=6 street; spawn street W then left/right (`borders`, `edge`): same monitor rules.
13. FPS-independent: everything above at dt 1/60, 0.1 and 0.25 and on the seeded variable-dt run (`vardt`: 0 boxed 30 s). Key behaviour to distance per 1/60 sub-step, never to frame time.
14. Tap-park (`park`, from spawn, west, southeast, northeast and after manual driving): (23,7) ≤1.6 s + 2·dt; Bain ≤20 s; Volaris ≤30 s from spawn (≤45 s from the other origins); 0 overlap; HUD honest on the route; the follower never sits still ≥3 s without arriving; **end-to-door distance ≤ nearest reachable site + 0.5 t (cap 6)**. Nearest reachable today: Bain 3.16 t at (42,25,sw); Volaris 1.96 t at (39,37.96,ne). r45j parks at 4.38/4.34 t and fails.
15. (22,18) (no route): the toast appears within **≤0.5 s at both 1440 and 375** without the truck moving (browser, `park4`).
16. G10 browser gate at the Forge-fixed site, both sides turn ≥0.9 q, no stop ≥0.5 s, at 1440 and 375.

## 4. The change: hybrid of variant B (Adonay's decision)
**Replace ONLY the collision/escape layer** of manual driving with Sentinel's simplified collision model (Sentinel r45k REVIEW §5). **Keep everything else** (list in §4.3) and prove it still works with the gates named there.

### 4.1 What you delete (the stacked escape layer in `src/game/jacT9.ts`, r45j line numbers)
All of these go. None may survive under another name; no timers, anchors or automatic manoeuvres replace them.
- `pinAnchor` auto-back (inside `stepManual`, ≈3110–3155) and the whole `stepManual` escape branch structure (≈3093–3419), rewritten per §4.2.
- `applyPinnedEscape` (≈3784–4022), `giveUpEscape` (≈3615) and `escapePace`, `escapeLatch` / `releaseEscapeLatch` / `armEscapeCap` (32 uses), `escapeBreakout` / `breakoutStep` (≈3700), `slideOffPin` (≈4052), `walkPinHeading` (≈4043), `rollOffPin` (≈3453), `longFrame` creep, `slowSteerT`.
- The swap "best hop" relocation in `syncManualFacing` (≈3024–3050) and `pullFrameLegal` / `backOutFootprint` when used to relocate on a swap.
- The soft heading caps `HEADING_CAP + 0.05` (60.5°, ≈3424) and `0.5 + SWAP_HYST + 0.2` (74°, ≈4175).
- Helpers left with no caller after this (e.g. `steerFanHit`, `rotatedRoom`, `axisHitFacing`, `clearSlide`, `realContact`, `rollingFree`, `recentTravel`) — delete them, don't keep dead code.

**Diff budget:** the `jacT9.ts` diff against `5a265621` must be **net negative**; expected roughly −600 to −1000 lines (the escape layer is ≈1100 lines; Sentinel's estimate for a full rewrite was −800 to −1200). Paste `git diff --stat 5a265621 -- src/game/jacT9.ts` in the PR body. A net-positive diff fails the round.

### 4.2 The replacement: Sentinel's model, per 1/60 sub-step, manual driving (D and R)
1. **Yaw.** `heading += steer · TURN_RATE · dt · sign(v)` (at v≈0 with gas: CREEP_YAW in the steering direction). Hard cap: heading within **±0.62 q** of the sprite. **A collision never changes the heading or the sprite.**
2. **Translation.** `d = v · dt` along the heading (within the 34° motion cone of the sprite).
3. **If the new pose is blocked:**
   - first, slide along the collision tangent if that direction is within 35° of the sprite;
   - else, binary-search the largest legal advance along `d` (clip);
   - else, v = 0 and bump (stop). With the nose pinned, the D1 rule (§3) applies: in-place sprite change only when legal, else vel 0 + "R" cue (`reverseCue`).
   - No teleport, no relocation, no change of translation side, no reverse against the gear.
4. **Sprite change** when the heading crosses the swap line, **only** if the rotated box fits at the current pose (no translation) and ≥0.1 t has been travelled since the last change (and ≥1 t free ahead when in place, per D1). At most one facet change per frame; stop sub-stepping after a swap.
5. **End of frame.** Snap back to the last legal pose. HUD mph from the real displacement: `mph = round(min(1, |Δpos|/dt/TOP)·10)`, 0 below 0.01 t (`syncMeters`). Anything that counts uses distance travelled, never wall-clock time.
6. **Autoroute uses the same primitive.** When the tap-to-drive follower (`stepDrive` and the path-follow helpers) moves the truck or meets an obstacle, it calls the same move/slide/clip/stop primitive; it does not keep a private escape path. Its route planning, turn alignment and park-site choice stay as they are (§4.3).
7. Add `get reverseCue(): boolean` and show the "R" cue next to the steering cue (`updateSteerCue`).

### 4.3 What you KEEP and must protect (each with the gate that proves it)
Do not rewrite these. Touch them only where they must call the new primitive (§4.2 step 6) or where a rule in §3 forces it, and keep their gates green.
| Keep | Where (r45j) | Gate in run-all (headless) | Browser gate |
|---|---|---|---|
| **Turn at speed (G10)**: full-lock turns complete on open road, no give-up snap or hard stop | `yawWithSteer`, `applyHeading`, `commitFacing`, `facingWithHysteresis` | `turn`: G10 and turn90b ≥98 % on the 6393 arc-legal poses at every dt, `snapGU` 0, `hardGU` 0; `partial` (±0.5/0.707/0.9 symmetric ≤3 pts) | `drive-real.mjs` G10 at the Forge-fixed site, 1440 + 375 |
| **Smooth sprite swap**: no heading jump, no speed drop, no lateral hop at the swap | `syncManualFacing` (minus best-hop), `commitFacing` | `swapq` (≤0.1 q beyond plain yaw, speed ratio 0.85–1.2, D and R, both sides); `h1` (autoTurn 0, swapLat ≤0.05); monitor `snapX`/`snap04`/`jumps` 0 | G7, G8 |
| **Overlap 0** | `poseBlocked`, `driveCellOpen`, claimed cells, `ensureLegalDrivePose`, `resolveOverlap` | `oracle` (grid + poseBlocked agree with the frozen oracle), `ov`, `honest` overlap 0, monitor `overlap` 0 on every manual run | G9; `forge-drive-real.mjs` |
| **Honest speedometer** (real displacement) | `syncMeters` | `honest` (HUD vs real displacement ≥99 %, wide35Both 0), `h3b` hudBad 0, `park` route `hudPct` ≥99 | G4 (needle) |
| **Tap-park / `parkForDoor` arrival at Bain and Volaris** | `parkForDoor` (jacT9.ts, scene.ts, main.ts), `tryNextSit`, `holdAtGoal`, `acceptNearGoal`, `clearDriveArrival` | `park`: (23,7) ≤1.6 s + 2·dt; Bain ≤20 s and Volaris ≤30 s from spawn, ≤45 s from west/southeast/northeast/after manual driving; 0 overlap; never still ≥3 s without arriving; end-to-door ≤ nearest reachable + 0.5 t (Bain ≤3.66, Volaris ≤2.46; r45j parks at 4.38/4.34 and fails) | `park4.mjs`: Bain and Volaris cards open, 1440 + 375 |
| **Joystick** (stick range ±1, symmetric +0.895/−0.905 steering; do not "fix" the stick) | input layer outside jacT9 + `setQaSteer` | `partial` (±0.25…±0.9), `brakesteer` | G2, G5 (stick visible and tracks its finger), `turnprobe.mjs` |
| **Tap-to-drive and autoroute** (route planning, turn alignment, replans, (22,18) "no route") | `stepDrive`, `alignTurn`, `snapTurnLane`, `dropPassedPathNodes`, `recoverPathFollow`, `tryReplan`, `noteFollowProgress`, `giveUpFollow`, `markStuck`, `turnCellOk`, `waypointFootOk` | `park` from 5 origins (incl. after manual driving), `trap`, `monkey` (mixed manual + tap play) | `park4.mjs` (23,7) 5/5; (22,18) toast ≤500 ms without moving, 1440 + 375; G1 |

Also keep the r45h fixes A–F (no straight-gas auto-yaw: `h1`; impact slide within 35°: `honest`; low-FPS overlap: `ov`/monitor at dt 0.25 and `vardt`).

### 4.4 Known risks of the hybrid (all measurable by the gate)
- Some r45j turns finish by "walking" the heading while pinned; without that layer they must finish by the plain yaw + swap. Covered by `turn` (arc-legal ≥98 %) and `partial`.
- The route follower may drift once it shares the primitive. Covered by `park` from 5 origins and `park4`.
- More stops with the "R" cue in tight spots. That is the intended behaviour; `escsteer` caps needs-R at 25 % and requires the cue in 100 % of them.

## 5. HARD GATE. Paste the full output of all of these in the PR body. Any FAIL means not done.
Forge/Sentinel re-run all of it on your pushed commit; their run is the verdict.
Build: `npm ci && npm run build:preview-integracion && npx vite preview --port 8747 --strictPort &`. URL: `http://127.0.0.1:8747/interactive-portfolio-playtest/preview-integracion/`. Use swiftshader GL.
1. `node scripts/qa/forge/run-all.mjs --jobs 6 --json /tmp/runall.json`: **exit 0**, all 53 cells PASS. Paste the whole stdout including the summary table.
2. `git diff origin/qa/forge-gates-r45j -- scripts/qa` and `git diff 5a265621 -- src/data`: both empty (paste the commands and their empty output).
3. `QA_GL=swiftshader QA_BASE_URL=<url> QA_OUT_DIR=/tmp/dr node scripts/qa/drive-real.mjs`: **G1–G10 PASS at 1440 and 375** (G2 with G-F, G10 with G-E; `cueHook=true` must appear in the G2 line; do not edit the gate).
4. `node scripts/qa/forge/forge-drive-real.mjs 1440 <url> /tmp/fdr` and `… 375 …`: PASS/PASS.
5. Browser HIGH-1/2 repro, both sizes:
   - `for s in A B F G H D E; do SC=$s node scripts/qa/forge/r45j/turnprobe.mjs <vp> <url> /tmp/tp; done`
   - `python3 scripts/qa/forge/r45j/backD.py '/tmp/tp/logs/turnprobe-*.json'`
   - Required: longest backward run in D with gas held ≤0.1 t in every scenario; H never flips the vel sign. Paste the per-file lines.
6. `node scripts/qa/forge/r45j/park4.mjs <vp> <url> /tmp/p4` at 1440 and 375 (and 1280 / 390 for the UX pass, §7):
   - (23,7) 5/5;
   - (22,18): `toastGate.pass` true: pointerup → toast text ≤500 ms (MutationObserver), text "No se puede llegar", the truck does not move, the toast becomes visible (the `toasts` opacity time is info only);
   - Bain and Volaris cards open.
7. 0 console errors in all browser runs.

**Commit message** lists the run-all summary line, the G1–G10 line at both sizes and the (22,18) toast ms at both sizes.

## 6. r45k fix pass (after Sentinel's ruling on 8bfa629: MIXTO, NOT APPROVED)
8bfa629 (net −1091 lines in `jacT9.ts`, frozen diffs empty, `reverseCue` present) failed 13/53. Sentinel and Forge both re-ran it and found part of that was the gate, and part is still implementation. The gate is amended (below, Forge commit on `qa/forge-gates-r45j`); **the rest is yours. Start from 8bfa629, keep everything in §0–§5, and fix exactly these:**

| ID | Sev | Gap (measured) | Required behaviour | Gates it clears |
|---|---|---|---|---|
| **I-1** | HIGH | `qaSpawnDrive` and getting in (`setMode('drive')`) leave `travelSinceDir = 0`, and the swap rule (`SWAP_TRAVEL_MIN`) treats that as a sprite change. With the nose against a prop on entry, a legal in-place swap (steering-side facet fits, ≥3 t free) is refused and the R cue shows: 34 unjustified needs-R in `escsteer` at every dt, 24 `h3b` runs with an unjustified cue. | D1's "≥0.1 t since the last sprite change" only applies once a sprite change has happened since getting in. Use an internal "no change since entry" flag inside the swap rule. **Do not change what the QA hooks do.** | `escsteer` needRUnjustified, `h3b` cueUnjustified |
| **I-2** | MED | `update()` swaps at the **start** of the frame and keeps sub-stepping with the new facet (contradicts §4.2 step 4). At 60 fps the swap is decided at the previous pose and the same frame drifts 0.003 t across the footprint rounding → in-place swaps with <1 t free (turn ×8, partial ×3, escsteer ×5, rmirror ×3, shuttle ×3, vardt). At dt 0.25 the swap frame travels up to 1.29 t on the new facet → swaps after <0.1 t (monkey 0.1/0.25, vardt). A second swap path (`dir` changing inside `stepDrive`, `heldDir` null) also bypasses the in-place guard. | Swap at the **end** of the frame, after the last sub-step, with all three D1 conditions evaluated at the **final** pose. One swap path for manual driving. | `turn`, `partial`, `rmirror`, `shuttle`, `escsteer` inPlace at 1/60; `monkey` shortSwap/inPlace; `vardt` |
| **I-3** | HIGH | Trap at (17.8, 19.0) (monkey dt 0.25 seed17; R battery frees only 0.10 t): a 0.02–0.1 t lateral slide puts `cx < 17.95`, the sw box grows from x 17..19 to x 16..19 and wedges between (16,16) and (16,22). Same spot as r45j's low-FPS trap. | A slide may not end in a pose from which reversing along its own axis is blocked when it was not blocked before the slide (reject or shorten that slide). | `monkey` boxed (G-D), `trap` |
| **I-4** | LOW | The R cue flashes for one frame before a rolling swap lands (3/28/15 runs by dt). | Compute the cue after the frame's swap decision (falls out of I-2). | cosmetic; `cueUnjustified` tolerates <0.3 s |

| **I-5** | MED | In-place yaw at `CREEP_YAW` = 0.667 q/s takes 0.93 s to reach the 0.62 q cap, so the truck sits 1.0–1.25 s with no motion and no R cue (h3b dead stops 26/12, 22/10, 31/37 by dt with the 1.0 s fallback; G10-left browser stop at (20.3,1.95); G2 window at (48.32,1.95) and the stop at (18.95,12.23,nw), neither a dead end). | `CREEP_YAW = TURN_RATE` (2.4 q/s): Forge and Sentinel measured 0 dead stops even with a 0.5 s fallback (longest still-without-cue 0.33 s). | `h3b` dead (G-A 1.0 s), drive-real G10 (G-E), G2 |
| **H-1** | required | The browser gates G-E/G-F must see the R cue; `jacSnapshot()` does not expose it. | **Allowed QA-hook exception (the only one):** in `src/game/jacT9.ts` add `reverseCue: boolean;` to `type JacSnapshot` and `reverseCue: this.reverseCueOn,` to the object returned by `snapshot()` (after `toggles`). Nothing else in the hooks changes. | drive-real G2/G10 (`cueHook=true`) |

**Amended gates (Forge, from Sentinel's ruling; already in `run-all.mjs`):**
- **G-A `h3b` dead stop:** counts only stretches ≥0.5 s still (disp < 0.08·dt, |vel| < 0.2), not yawing (|Δheading| < 0.1·dt q) and with no R cue, or ≥**1.0 s** still with no R cue even while yawing (`THRESH.h3bStillNoCueS`; was 1.5 s, tightened by Sentinel's QA1 ruling). New `cueUnjustified` = 0: the R cue shown ≥0.3 s while the oracle says D1 allows the in-place swap to the steering side (box fits, ≥1.0 t free, ≥0.1 t since a real sprite change; entry is not a change). A build that shows R everywhere fails this.
- **G-B `h3b` shuttle:** inside the 3 s / 1.5 t window, path − net displacement ≥0.5 t (a real back-and-forth). Arrive-and-stop no longer counts.
- **G-C `escsteer`:** the 25 % needs-R bar is replaced by `needRUnjustified` = 0 (needs-R where a neighbour facet on either side fits with ≥1.0 t free and ≥0.1 t since a real change). R cue 100 % of needs-R and trapped 0 are kept. With I-1 fixed, ≈91–92 % of stuck states are genuine dead ends (nose flat against the obstacle, only the 180° facing free) — that is D1 working, not a failure.
- **G-D `monkey`/`vardt` boxed 30 s:** counts only if the `trap` battery (R and D with ±steer) from the end of the boxed window also fails to move the truck ≥1.5 t.
- **G-E drive-real G10 (QA1 ruling):** positioning in closed loop (R + gas until cx ≤ 16.3, cap 3 s); the 2.8 s steer is never cut. ≥0.9 q within 2.0 s of steer onset; before that crossing no gas+steer stop ≥500 ms; after it, full G-A (dead stop 0.5 s not yawing / 1.0 s still without cue; unjustified cue ≥0.3 s = 0); every sample |Δh| ≤ 2.4·min(dt,0.25)+0.05 q.
- **G-F drive-real G2 (QA1 ruling):** a stuck 1.5 s window is excluded only if at its final pose the oracle says the nose is pinned, there is no legal swap toward the held-steer side, and the R cue was on ≥1.0 s of the window. Tree/cactus: if the contact pose is a true dead end, the R cue must show ≤0.5 s after contact and R may free it; otherwise "freed without R" stands. Excluded windows are listed in the G2 line.
- **park4 (22,18) (QA1 ruling):** pointerup (window capture) → toast text (MutationObserver) ≤500 ms, text "No se puede llegar", no movement, toast visible at some point.
- Unchanged: `inPlaceBad`, `shortSwap` and every other threshold — they are I-2.

Expected after I-1..I-3 + I-5 + H-1: `run-all` exit 0 (53/53) and §5 browser gates PASS at both sizes.

## 7. QA3 gate amendments (Sentinel REVIEW-QA2: CAMBIOS; Forge commit on `qa/forge-gates-r45j`)
Implemented in `scripts/qa/drive-real.mjs` (from Sentinel's `drive-real.sent.mjs`) and `scripts/qa/forge/r45j/park4.mjs`. Product untouched.
- **A1 `holdStick`:** touchStart, one touchMove to the target (ack timed), then wait `ms − ack` and touchEnd. No ramp, no re-sends. Each hold is logged in HOLDLOG `{ms, wallMs, lastAckMs}`.
- **A2 G10:** closed-loop reverse (release at observed cx ≤ 16.3), `revCoast = releaseObservedCx − minCx ≤ 1.5 t` (more is a product FAIL); straight gas in closed loop until cx ≥ 17.5 (touch trigger 16.8), then 2.8 s steer on the same input; `startOk` is judged at the steer-onset sample: cx ∈ [15.0, 18.6], cy ∈ [5.5, 6.6], se, D, |heading| ≤ 0.1; `g10Eval` unchanged.
- **A2′ (touch):** the steer-onset window is cx ∈ [15.0, **19.4**] in touch (CDP touch lands about one frame late at 6–7 t/s); cy/dir/gear/heading unchanged. Desktop stays [15.0, 18.6].
- **A3 G2 contact:** contact = last sample before the hold; stop = first ≥250 ms run with per-frame displacement < 0.002 t. Moved < 0.10 t → classify at the contact; otherwise classify at the stop only if it is ≤ 1.0 t from the contact and the nose is ≤ 0.3 t from the prop, else INCONCLUSIVE. Classified once with the oracle `deadEndAt`. Dead end → R cue ≤ 0.5 s after the stop, then R allowed; otherwise leave in D.
- **A4 G-F exclusion:** a cue-off sample is covered only if pinned, no legal swap toward the side held in that sample, yaw toward that side ≥ 1.0 q/s, run ≤ 1.0 s, ending with the cue on or at the window end. `a4Ok = pinned ∧ cueMs ≥ 400 ∧ uncovMs ≤ 250`; `excluded = pinned ∧ noSwapToSide ∧ (cueMs ≥ 1000 ∨ a4Ok)`.
- **H-2 route retries:** up to 3 attempts per prop route, each a fresh session; all 3 failing = G2 **INCONCLUSIVE**, which is not PASS (exit ≠ 0).
- **G-G G8 = D1:** a 90° sprite step needs ≥ 0.1 t since the previous facing, or must be a legal in-place swap (rotated box free with ≥ 1 t clear ahead, oracle). Same rule as run-all.
- **Tree route (harness):** at 375 the route holds the x≈55.2 lane south (55.2,12) → (55.2,16.2) → (53.2,18.6) → (50.5,18.6). If a route leg or the chase ends pinned with the R cue on or in an oracle dead end (e.g. (25.95,17.97), (50.95,27.05), (46.05,23.03), (30.94,5.05)), it backs out with `reverseOut` and resumes from the waypoint it was on (≤ 2 recoveries, logged as `routeRecoveries`). The tree's `gearsUsed` counts only from the tree hold on.
- **park4:** viewports 1440, 1280, 375 and 390 (390×844 DPR 3 touch). A target is tappable when it is inside the viewport and `elementFromPoint` there is the map canvas; up to 14 zoom-outs. A drag cannot pan while driving (the camera follows the truck, `scene.updateCameraFollow`), so doors are reached by zoom, not pan.

### 7.1 QA3 ruling (Sentinel REVIEW-QA3, G10 option A approved)
- **Hook H-2 (product, QA only): `gameTimeMs` + `frameId`** in `jacSnapshot()` (`__playtestQa.jac()`):
  - `gameTimeMs` is a monotonic count of accumulated game time in ms, using the same `dt` the truck integrates (ticker elapsed, capped at 0.25 s).
  - `frameId` is the ticker frame counter.
  - Both come back in the same snapshot object as `heading`, from the same frame, so drive-real reads them atomically.
  - The cloud agent adds them together with the G3 fix. Until that SHA lands, G10 fails closed on every build.
- **G10 dh criterion (QA3 option A; condition 3 replaced by QA3b; de-duplication from QA3c):**
  1. Per consecutive sample pair: |Δh| ≤ 2.4·min(Δt_game, 0.25) + 0.05 q, with Δt_game = Δ`gameTimeMs`.
  2. 3a: a pair whose `frameId` is not strictly increasing, or whose Δt_game ≤ 0, is non-atomic. More than 2 % of a turn's pairs ⇒ **INCONCLUSO**.
  3. 3b (≥ 250 ms approved in QA3c): a pair whose Δt_game is at the 0.25 s cap (≥ 250 ms; one capped frame gives exactly 250 ms) is flagged. More than 2 % ⇒ **INCONCLUSO**.
  4. Info only, not part of the verdict: Δt_wall, the wall-clock dh, and pairs with |Δt_game − Δt_wall| > max(50 ms, 1.5·frameMed), where frameMed is the median positive Δt_wall (`info_clockGap`).
  5. If any sample lacks `gameTimeMs` or `frameId`, G10 = **FAIL**. There is no fallback to wall time.
  6. QA3c, de-duplication **before** judging (applies to all of `g10Eval`):
     - An exact duplicate read (same `frameId` + `gameTimeMs` + `heading` as the previous sample) is dropped. This is a late harness read of the previous frame, and it is atomic. The count per turn is logged in `dedup` (`duplicatesDropped`, `duplicatePct`, `distinctFrames`).
     - The turn is **INCONCLUSO** if it has fewer than 10 distinct frames after the drop, or if duplicates are more than 50 % of its raw samples.
     - A run of duplicates lasting more than 250 ms of wall time means the ticker froze. It is logged in `frozenTickerRuns`, and the turn is **INCONCLUSO**. The turn here is the whole G10 sample window of that side.
     - Not dropped, and still non-atomic under 3a: the same `frameId` with a different `heading` or `gameTimeMs`, or a `frameId` that goes backwards.
  - G10 combines the two sides: any FAIL ⇒ FAIL, otherwise any INCONCLUSO ⇒ INCONCLUSO.
  - Closing G10 requires PASS at 1440 and at 375 in 2 consecutive runs, on the SHA with the G3 fix and H-2.
- **park4 freeze / stale reading:**
  - A trial is **INCONCLUSO** in any of these cases:
    - a rAF gap ≥ 2000 ms;
    - wall time > budget + 5 s;
    - the fresh end snapshot is > 0.5 t from the last rAF sample;
    - the last sample is > 2000 ms old;
    - a harness error.
  - Arrival is judged on a fresh snapshot.
  - INCONCLUSO trials are retried up to 3 times, each in a fresh context.
  - Exit codes: 0 if all PASS, 1 if any FAIL, 2 if any INCONCLUSO.
  - An arrival PASS needs `arrived`, plus a card for doors, a card–dock overlap of 0, and 0 moving frames over a blocked footprint.
