# Forge hostile QA gates (r45h must-pass)
Usage: node scripts/qa/forge/<script>.mjs <1440|375> <baseUrl e.g. http://127.0.0.1:4173/interactive-portfolio-playtest/preview-integracion/> <outDir>
Scripts: forge-drive-real.mjs (r45d real-input gate), hostile.mjs, fbprobe.mjs, park2.mjs, park3.mjs, bainprobe.mjs; an.py analyses hostile logs.
All must run at 1440 and 375 with 0 footprint-overlap frames (window.__playtestQa.jacFootprintBlocked() false), 0 R taps needed, 0 console errors.

## Cumulative headless gate (r45h Sentinel + r45i + r45j + r45k plan review): `run-all.mjs`
`node scripts/qa/forge/run-all.mjs [--repo <checkout>] [--dt 0.0166667,0.1,0.25] [--only turn,shuttle] [--jobs 6] [--json out.json]`
- Bundles the checkout's real `JacT9` (esbuild, pixi stubbed) and runs 19 checks in worker processes: 17 × dt 1/60, 0.1, 0.25, plus `oracle` once and `vardt` on a seeded 16/16/33/250 ms sequence = 53 cells.
- **Collision oracle (independent of the build):** `oracle.mjs` judges overlap with a fixed footprint formula against `frozen-drive-grid.json` (walkable grid frozen from `cursor/integracion` 5a265621 `src/data` with `freeze-map.mjs`). The `oracle` check fails if the build's drive grid or `poseBlocked` disagree with it. Re-freeze only if Forge deliberately changes `src/data`.
- Checks:
  - Sentinel r45h: `ov`, `h1`, `h3b`, `honest` (HUD mph vs real displacement ≥99 %, wide35 off **both** pre- and end-of-frame sprite = 0; pre-frame figures are information), `park` (5 origins incl. manual drive; (23,7) ≤1.6 s + 2·dt; Bain/Volaris end-to-door ≤ nearest reachable + 0.5, cap 6).
  - r45i: `turn` (G10 + turn90b ≥98 % on the 6393 arc-legal poses; all-pose figures informational), `swapq`, `monkey`, `esc2`, `trap`.
  - r45j: `escsteer` (D1 rule; since the r45k ruling G-C: `needRUnjustified` 0 — needs-R only where D1 forbids every in-place swap per the oracle; `jac.reverseCue` shown in 100 % of needs-R; trapped 0; needs-R share informational), `shuttle`, `edge`.
  - r45k ruling (Sentinel MIXTO on 8bfa629, applied by Forge): G-A `h3b` dead stop = ≥0.5 s still + not yawing + no R cue, or ≥1.5 s still + no R cue; `cueUnjustified` 0 (cue ≥0.3 s where D1 allows the steering-side in-place swap). G-B `h3b` shuttle needs path − net ≥0.5 t. G-C as above. G-D `monkey`/`vardt` boxed counts only if the trap battery also fails. D1 ahead distance for these judgements: `THRESH.d1AheadT` = 1.0 t.
  - r45k: `partial` (steer ±0.25/0.5/0.707/0.9 under the monitor; left/right symmetry ≤3 pts for |steer| ≥0.5, ±0.25 informational), `vardt`, `borders` (all 4 edges + corners), `rmirror` (R gas into props/borders), `brakesteer` (brake + steer at rest, D and R).
  - Per-frame monitor on every manual run: snaps (dt-scaled, and >0.5 q beyond plain yaw), D-gas reversals, backward run in D ≤0.1 t, frames ending behind their start, R mirror, frame jumps, heading ≤0.62 q off the sprite (moving and at rest), swaps after <0.1 t, illegal in-place swaps (box overlaps / <0.1 t / <1 t free), oracle overlap. Coasting off momentum right after a gear change is not counted as reversal.
- Thresholds live in `THRESH` at the top of the file. Exit 0 = every cell passes, 1 = any FAIL, 2 = harness error.
- `../sentinel-r45h/honest.mjs` and `h3b.mjs` carry the same semantics standalone (the r45j fix agent's axis edit is reverted).
- Gates are Forge's. A fix agent never edits `scripts/qa/**`; Forge or Sentinel re-run this on the pushed commit.
- Reference runs: `r45j/runall-v2-r45j-5a265621.txt`, `r45j/runall-v2-r45i-6450f1f.txt`, `r45j/runall-v2-r45h-d2bd630-honest.txt` (v1 runs kept as `runall-r45j-*.txt` / `runall-r45i-*.txt`).
