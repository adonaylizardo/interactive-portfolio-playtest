# Forge r45j probes (QA of cursor/integracion 5a265621)

The cumulative gate is `../run-all.mjs` (r45h Sentinel + r45i + r45j checks, dt 1/60, 0.1, 0.25, one exit code).
These files are the single-purpose probes it was distilled from, kept for repro and debugging.

Headless (real JacT9 bundle; `BUNDLE=/tmp/x.mjs node <probe> [dt]`, bundle built with `npx esbuild scripts/qa/sentinel-r45h/entry.ts --bundle --format=esm --platform=node --outfile=/tmp/x.mjs --alias:pixi.js=$PWD/scripts/qa/sentinel-r45h/pixi-stub.mjs '--define:import.meta.env.BASE_URL="/"'`):
- `gi.mjs`: GU-independent monitor: turn at speed, porch/cactus stuck → steer-only vs R escape, per-frame lateral hop, heading jump, heading off sprite, backward travel in D.
- `shut3.mjs`: into-prop shuttle in a 3-tile box (≥2 D velocity reversals, ≥6 s, 12 s gas+steer); porch, cactus, top edge.
- `tr3.mjs <x> <y> <dir> <steer>`: frame trace of one gas+steer hold (shows the pinAnchor crawl/back-up cycle).
- `spin.mjs`: random play; sprite swaps after <0.3 / <0.1 tile of travel, heading off sprite at rest.
- `trap2.mjs`, `pocket.mjs`, `reach.mjs`: trapped poses and whether driving can reach them (the (25,23–24) pocket cannot).
- `near.mjs`, `near2.mjs`: park-site distance to door, reachable alternatives (Volaris (39,38.36)).

Browser (real input; `node <probe> <1440|375> <url> <outdir>`, playwright):
- `turnprobe.mjs` (env `SC=A..I`): spawn W→W+D, left/right turns at x22/24/30, porch/cactus routes + escapes, stick range.
- `pinprobe.mjs`: steer held into a prop in the browser.
- `park4.mjs`: tap-to-park (23,7), (22,18), Bain, Volaris with 120 s budgets.
- `backD.py '<outdir>/logs/hostile-*.json'`: backward travel in D with gas held, from hostile/turnprobe frame logs.
- `tp_an.py`, `an2.py`: turnprobe / hostile frame analysis.
