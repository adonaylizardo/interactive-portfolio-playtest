# Forge hostile QA gates (r45h must-pass)
Usage: node scripts/qa/forge/<script>.mjs <1440|375> <baseUrl e.g. http://127.0.0.1:4173/interactive-portfolio-playtest/preview-integracion/> <outDir>
Scripts: forge-drive-real.mjs (r45d real-input gate), hostile.mjs, fbprobe.mjs, park2.mjs, park3.mjs, bainprobe.mjs; an.py analyses hostile logs.
All must run at 1440 and 375 with 0 footprint-overlap frames (window.__playtestQa.jacFootprintBlocked() false), 0 R taps needed, 0 console errors.

## Cumulative headless gate (r45h Sentinel + r45i + r45j): `run-all.mjs`
`node scripts/qa/forge/run-all.mjs [--repo <checkout>] [--dt 0.0166667,0.1,0.25] [--only turn,shuttle] [--jobs 6] [--json out.json]`
- Bundles the checkout's real `JacT9` (esbuild, pixi stubbed) and runs 13 checks × 3 dt in worker processes.
- Checks: ov, h1, h3b, honest, park (Sentinel r45h); turn (G10 + turn90b), swapq, monkey, esc2, trap (r45i); escsteer, shuttle, edge, plus a per-frame monitor (snaps, D-gear reversals, backward travel in D, frame jumps, heading off sprite, near-in-place swaps) on every manual run (r45j).
- Thresholds live in `THRESH` at the top of the file. Exit 0 = every cell passes, 1 = any FAIL, 2 = harness error.
- Reference runs: `r45j/runall-r45j-5a265621.txt` (15/39 fail) and `r45j/runall-r45i-6450f1f.txt`.
