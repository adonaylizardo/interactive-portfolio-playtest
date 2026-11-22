# r45i hostile QA — cursor/integracion 6450f1f (on b60a6f9 / adc0e64)
Date: Sun Nov 22 2026, 00:02–01:20 (UTC-4). Local build (npm ci, build:preview-integracion, vite preview :8747). Not published, merged, or messaged. No QA files in the repo; worktree clean.
Commits 6450f1f/b60a6f9/adc0e64: author Adonay Lizardo <adolizardo@gmail.com>. 25 files (+1158/−129), no png/webm/dist.

## VERDICT: NOT READY

r45h HIGH-1/2/3 and MED-1/2 are fixed under the conditions they were reported in. The new escape logic causes a worse regression: **the truck now refuses to turn in normal driving.** Turning hard at speed often makes the sprite jump 90° in one frame and drops the truck from 5.2 t/s to 0. It then stays stopped with the amber cue while the wheel is held, even on the open north street, far from props.

- The agent's drive-real G2/G3 failures are a **real UX regression, not a gate-design issue**. All 14–15 G2 stall windows are on the open street (y 3.7–7, x 23–39), not at the cactus or tree. The scripted route never gets there because the truck keeps stopping on the way.
- The stop is escapable with **R + straight back-up**. Reverse + steer and opposite-steer in D often do NOT free it.

## Agent claims: verify, don't trust
| Claim | Ours | OK? |
|---|---|---|
| overlap 0/0/0 (dt 1/60, 0.1, 0.25) | 0/0/0 | ✅ |
| no-steer facing changes 0/816 | 0/816 ×3 | ✅ (straight gas only) |
| swap lateral 0 | 0.000 ×3 | ✅ |
| porch/cactus shuttle 0 | porch 0/148, cactus 0/132 ×3 | ✅ but the metric ignores stops: 110/148 porch and 105/132 cactus runs end in a dead stop |
| vel honesty 100% | 100% ×3, maxErr 0 | ✅ (vel reads 0 on every sprite-swap frame, and that is honest: the truck really stalls one frame) |
| (23,7) 1.4/1.5/2.3 s | 1.4/1.5/2.3 s | ✅ |
| Volaris 23.5–26 s | 23.5/24.9/26.0 s, ends (39,40.34–40.39) | ✅ headless |
| Bain 13–14 s to (43.4,26), 4.4 tiles from door | 13.3/13.8/14.3 s, (43.38–43.40,26) | ✅ (4.4-tile walk; LOW) |
| forge-drive-real passes both sizes | PASS/PASS, ce 0 | ✅ (the gate does not test steering at speed) |
| park4 (23,7) 5/5 | 5/5 @1440, 5/5 @375, fb 0, spins 0 | ✅ |
| (22,18) toast 392 ms@1440 / 1302 ms@375 | 168 ms / 605 ms, stays seated | ✅ |
| G2 fails only because route never reaches props | **False.** G2 windows are open-street turn stops. 1440 trace: truck sat about 21 s at (26.0–26.07,3.81) with alternating steer and no R | ❌ |
| Bain/Volaris don't finish in park4 budget (5 fps) | With a 120 s budget: Bain 30.6 s (1440) / 30.8 s (375), card opens. Volaris 61.9 s / 49.0 s, card opens | ✅ (truck stops at (39,43–44) in the browser vs 40.34 headless: LOW) |

## Adversarial findings

### HIGH-A — Steering at speed snaps 90° and stops dead (normal-play turn refusal)
- **Repro, real keys / stick, both sizes:** get in at spawn (20,6,se). Hold W until x≥22, then W+D.
  - 1 frame: sprite se→sw (Δheading 1.00 q = 90°), vel 5.2→0.
  - The truck stays stopped 2.3 s (1440) / 2.8 s (375) with gas and steer held, amber cue showing.
  - Proof: `shots/r45i-1440-spawn-WD-snap-stop-crop.png`, `shots/r45i-{1440,375}-spawn-WD-snap-stop-strip.png`, videos `hostile/video/turnprobe-*-A.webm`.
- **Street, scenario C:** W to x≥28, then W+D → stops at (30.6–31.7, 6.05). At 375, releasing steer and holding W gives 0 tiles of travel.
- **Headless, real JacT9** (`probe/turn90b.mjs`): 90° turn attempts at speed with 3.5 tiles clear ahead.
  - r45i completes **4932/12084**; r45h (d2bd630) completes 9779/12084.
  - r45i: 7152 dead stops (escapeGaveUp). 5747 start with a one-frame sprite turn >0.4 q; 6035 drop from >3 t/s to 0 in one frame; in 3759 the facing being turned toward is clear for 2.5 tiles.
  - Interior map only (x,y 10–50): r45i 671/2134 vs r45h 1609/2134.
- **Random play** (`probe/monkey.mjs`, 120 seeds × 120 s of random keys incl. R):
  - escapeGaveUp is active **30% of play time** (r45h 0%).
  - 12/120 seeds get boxed in for 30 s (r45h 0/120).
- **Agent gate:** G2 14/15 windows and G3 124°/86° come from these stops and swaps (G3 86° is at spawn).
- **Waypoint drivers:** they now fail 5–6 of 6 route segments with 1–4 R back-ups each (r45h: 0 R, cactus and pocket reached).
- **Cause (code):** in `stepManual`, the `gas && steerOn && slowSteerT>0.1 && room∉{0,≥1.5}` → `giveUpEscape` branch, and the swap branch `axisHit(dirSign,1.6) < 1.5 && steering` → `giveUpEscape`. The swap sets `heading = dirIndex(next)` and does not translate on that frame. Both fire in ordinary turns, not just at props.

### HIGH-B — Every sprite swap is a hitch: heading jump of about 33° plus a one-frame full stop (open field)
- **Headless open-field circle** (`probe/swapq.mjs`):
  - Every swap: heading jumps 0.33–0.37 q (30–33°) in one frame; speed goes 4.3→0→1.7 forward and −3.2→0→−1.7 in R.
  - r45h: 0.01–0.12 q and 5.2→5.2.
  - Same at dt 0.1.
- **Browser:** every swap logged vel→0 (e.g. 4.3→0, 2.8→0, 3.3→0). D/E routes show 17–61 one-frame heading jumps >0.3 q.
- **Effect:** turning feels like stutter-stepping. Reverse+steer left and right both end at heading ≈2 after 2 s (r45h: 1.54 / 2.46, i.e. opposite directions).
- Rated HIGH because it affects every turn. It may be acceptable as MED if HIGH-A is fixed.

### MED-1 — The stop's escape only works with R + straight; steering out does not
- **Browser:**
  - Opposite steer in D after the stop: 0.00–0.04 tiles (1440-E, 375-E).
  - R + straight 2 s: 1.8–6.5 tiles. 375-E: R then D-steer ended only 0.73 tiles from the stop.
- **Headless esc2** (stops created from arbitrary poses aimed at the prop):
  - porch: 86/110 freed, 24 not freed by any of 27 R/D/steer combos;
  - cactus: 93/105 freed, 12 not;
  - e.g. spawn at (26,17,se) + W+A: an auto reverse arc in D moves it back to 25.55, then <0.1 tile of travel under every input; heading 3.62 on an ne sprite.
- **Natural approaches** (`probe/trap.mjs`, `mtrap.mjs`): all freed by R+straight (5–15 tiles). Reachability of the 24+12 trap poses is unproven. Treat as MED pending the fix.

### MED-2 — Hidden heading wanders far from the sprite at rest
- An2/an restWorst is 108° / 123° (fbprobe) and 77° / 155° (hostile); r45h was ≤56°.
- The giveUp drift moves the heading monotonically (0.44 + 0.16·t q). The amber cue arrow points up to about 155° away from the truck's nose.

### LOW
- **LOW-1:** End-of-auto-drive ghost move. Hostile-1440 tap-park-teresa: a one-frame 0.38-tile jump (45.375→45,26) with vel 0.
- **LOW-2:** Bain parks 4.4 tiles east of the access tile. Volaris stops 3–4 tiles south of (39,40) in the browser (39,43–44) vs 0.34 headless. The card opens in both.
- **LOW-3:** Agent harness `vol2.mjs` hardcodes `./bundle.mjs` (ERR_MODULE_NOT_FOUND with BUNDLE=).

## Re-checks (r45d–r45h)
- 0 console errors in every run.
- fb (footprint overlap) 0 frames everywhere.
- maxPerFrame ≤0.518 (5.17 t/s, 1 frame).
- No auto-R by the app. Every logged D→R is our driver's own tap.
- Gear element stable (gearElIds [1]).
- Dock bg constant.
- No orange flash.
- Toast for unreachable works.
- Card/sheet vs dock 0 px² at 1440. At 375 the sheet-box metric reads 20580 as in r45h, but the screenshots show the dock hidden and the card clear.
- Two-finger pan keeps the stick active.
- Pixel lights row at 375: bad=[], ce 0.
- G8 spins: PASS (r45h LOW-1 fixed).
- Heading at rest ≤56°: **FAIL** (MED-2).

## r45h → r45i
| Item | r45h | r45i |
|---|---|---|
| HIGH-1 90° auto-turn on straight impact | 11/21 snaps (9/8 no-steer) | 0/816 no-steer headless, 0 NOSTEER swaps in browser ✅. **Now on steer: 1-frame 90° + stop (HIGH-A)** |
| HIGH-2 Bain tap → gets out at spawn | yes | fixed: drives 62 tiles, card in about 31 s ✅ |
| HIGH-2 Volaris → stuck at (55.87,41.05) | toast 39.6/31.9 s, 16.9 tiles off | fixed: 105 tiles, card in 49–62 s wall (23.5–26 s game) ✅ |
| HIGH-3 porch/cactus shuttle | about 60 s / 15 s shuttling | 0 shuttles ✅. Replaced by dead stops; escape needs R (MED-1) |
| MED-1 vel decoupled | 22 frames | 0 (100% honest) ✅ |
| MED-2 impact slide 0.34 t | yes | crab 0–1 frame, max 97° in 1 frame at 1440 (block-loop) ~ |
| LOW-1 G8 spins | 0.07–0.24 | PASS ✅ |
| Agent G2 / G3 | F/F, F/F (180°) | F/F, F/F (124°/86°) ❌ |
| 90° turn at speed, headless completion | 9779/12084 | 4932/12084 ❌ |
| Random-play time in forced stop | 0% | 30% ❌ |
| Swap heading jump / speed | ≤0.12 q, no loss | 0.33–0.37 q, 1-frame stop ❌ |
| restWorst heading at rest | 56° | 77–155° ❌ |

## Fix spec (paste-ready)
1. **Only give up for a real prop contact.**
   - Call `giveUpEscape` only when `nosePinned(dirSign)` OR a contact/bump happened in the last ~0.3 s.
   - Never call it from the `slowSteerT` crawl branch or the post-swap `axisHit<1.5` branch while |vel| > 1.2 or the truck moved > 0.3 tiles in the last 0.5 s.
   - If the turned facing is blocked within 1.5 tiles, keep the old sprite and keep rolling (slide or follow the street) instead of stopping.
   - **Test:** headless turn90b r45i completion ≥ r45h (≥9779/12084; interior ≥1609/2134); escapeGaveUp share in monkey ≤2%; browser scenario A/C (spawn W then W+D) has no stop >0.5 s.
2. **No 90° sprite jump without travel.**
   - A swap must happen only when |heading − dirIndex| crosses 0.5 q through gradual yaw.
   - Remove `this.heading = dirIndex(next)` on the swap (keep the continuous heading). Let the swap frame translate.
   - **Test:** swapq heading jump ≤0.12 q, speed loss ≤10% per swap at dt 1/60 and 0.1; browser: no frame with Δheading >0.3 q.
3. **Make escape from a stop work by steering.**
   - When stopped with the cue, the opposite steer in D or R+steer must produce ≥1.5 tiles in 3 s.
   - Bound the giveUp heading drift to ≤0.5 q off the sprite (cap, don't grow with time), so the cue arrow stays ≤45–56° at rest.
   - **Test:** esc2 TRAPPED = 0 at porch and cactus; restWorst ≤56°.
4. **Gates must cover turning at speed.**
   - Add a G10 "turn at speed": a 0.5 s straight run, then full steer; ≥75% complete a 90° turn with no stop.
   - Do not count dead stops as non-shuttles in h3b.
   - Fix `vol2.mjs` to honour BUNDLE.
5. **(LOW)** Remove the 0.38-tile end-of-route snap. Park Bain within 2 tiles of the access tile; the browser Volaris stop should match headless.

## Artifacts
- **Logs** (`logs/`):
  - sentinel.txt, sentinel-park.txt
  - turn90-interior.txt, swapq.txt, monkey.txt, mtrap.txt, esc2.txt, trap.txt, fromspawn.txt
  - park4-*.out, forge-*.out, agent.out, fbprobe-*.out, hostile-*.out, turnprobe-*.out
- **Probes:**
  - probe/*.mjs (headless, real JacT9 via the Sentinel bundle)
  - hostile/turnprobe.mjs and tp_an.py (browser, real keys / CDP stick)
  - hostile/park4.mjs (budgets 120 s)
- **Shots:**
  - shots/ (proof)
  - hostile/shots, agent/*.png, pixel/
  - videos in hostile/video, ours/video
