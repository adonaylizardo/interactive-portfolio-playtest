# Run #3 UI gate (Figma file D1Vq9b3rBzXquj0FjwSV2q)

Compare uses `public/figma-specs/*.png` at 375×812 (phone, DPR2→1x) and 1440×900 (desktop).

| Screen | Crop region | Diff % | Notes |
|--------|-------------|-------:|-------|
| talks-desktop-map | rail 64×900 | 1.93 | PASS |
| talks-desktop-list | panel 432×900 | ~17 | Typography/antialiasing vs static export; layout/assets aligned to spec |
| talks-desktop-player | panel 432×900 | ~23 | Player chrome + up-next list vs static frame |
| talks-phone-map | top 375×128 | ~36 | Live checklist copy/state vs Figma mock "3/5" |
| talks-phone-list | sheet 375×524 @ y=288 | ~18 | Sheet height/scroll vs frame |
| talks-phone-player | sheet crop | ~37 | Detail density + map peek |
| writings-desktop-map | rail | 1.93 | PASS |
| writings-desktop-list | panel | ~17 | Same class as talks list |
| writings-desktop-reading | panel | ~10.6 | Nearest to gate; section filters + hero |
| writings-phone-map | top strip | ~43 | Checklist strip |
| writings-phone-list | sheet crop | ~21 | Sheet geometry |
| writings-phone-reading | sheet crop | ~27 | Reader body scroll |

Side-by-sides: `artifacts/verify-edificios-sbs/sbs/`  
Crops: `artifacts/verify-edificios-sbs/crops/`

Map-center is live Pixi; only chrome crops are comparable for map steps.
