# Forge hostile QA gates (r45h must-pass)
Usage: node scripts/qa/forge/<script>.mjs <1440|375> <baseUrl e.g. http://127.0.0.1:4173/interactive-portfolio-playtest/preview-integracion/> <outDir>
Scripts: forge-drive-real.mjs (r45d real-input gate), hostile.mjs, fbprobe.mjs, park2.mjs, park3.mjs, bainprobe.mjs; an.py analyses hostile logs.
All must run at 1440 and 375 with 0 footprint-overlap frames (window.__playtestQa.jacFootprintBlocked() false), 0 R taps needed, 0 console errors.
