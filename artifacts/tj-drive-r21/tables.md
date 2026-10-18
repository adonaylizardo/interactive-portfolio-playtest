# r21 live `index-Cxl-c8F7.js`

base: https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/
probed: 2026-10-18T10:00–10:27Z (fresh browser / dsf 1 / case)
retries: same hash, driveEnter-only flor + jacDriveTo ground (no app change)

(44,36) shortest-drivable is the street L via (44,17): straight 26.87, drive 38, **1.41×**. Actual travel 1.34–1.39×.
5 s stall: max `noProgressT` on the 15 ground runs was 3.22 s (replan, not clear). 0 premature get-outs. 0 goal-clears-far.

## phone-390

| kind | target | ok | ms | pos | extra |
| --- | --- | --- | --- | --- | --- |
| door | estudio | OK | 5797 | 29.73,38.85 | hops=0 Estudio |
| door | volaris | OK | 6008 | 37.84,36.02 | hops=0 volaris |
| door | bain | OK | 4351 | 37.71,28.89 | hops=0 bain |
| door | mentoria | OK | 4175 | 30.73,28.89 | hops=0 mentoria |
| door | finoa | OK | 1907 | 27.65,22.53 | hops=0 finoa |
| door | pg | OK | 3126 | 27.62,29.49 | hops=0 pg |
| door | sambil | OK | 17101 | 42.30,17.00 | hops=0 Sambil |
| door | catedral | OK | 7918 | 19.00,17.01 | hops=0 Catedral |
| door | flor | OK | 10390 | 48.78,41.98 | hops=0 Flor de Venezuela |
| ground | (46,20) | OK | 4903 | d=0.34 | travel=1.10× planned=1.13× stall=0.32 getOut=false |
| ground | (24,27) | OK | 4483 | d=0.31 | travel=1.03× planned=1.09× stall=1.23 getOut=false |
| ground | (37,26) | OK | 8347 | d=0.32 | travel=1.36× planned=1.40× stall=0.43 getOut=false |
| ground | (44,36) | OK | 7455 | d=0.29 | travel=1.39× planned=1.42× stall=0.53 getOut=false (retry jacDriveTo; first tap timed out at d=14.91) |
| ground | (18,36) | OK | 5015 | d=0.35 | travel=1.24× planned=1.28× stall=0.53 getOut=false |
| retarget | sambil→finoa #1 | OK | 1903 | 27.64,22.50 | finoa |
| retarget | sambil→finoa #2 | OK | 1870 | 26.32,22.53 | finoa |
| retarget | sambil→finoa #3 | OK | 1543 | 26.92,21.85 | finoa |
| retarget | sambil→mentoria #1 | OK | 2949 | 31.13,29.49 | mentoria |
| retarget | sambil→mentoria #2 | OK | 1896 | 30.79,28.78 | mentoria |
| retarget | sambil→mentoria #3 | OK | 2109 | 30.72,28.85 | mentoria |
| retarget | flor→volaris #1 | OK | 5209 | 37.73,36.14 | volaris |
| retarget | flor→volaris #2 | OK | 4201 | 37.70,36.01 | volaris |
| retarget | flor→volaris #3 | OK | 4120 | 37.83,36.07 | volaris |
| retarget | estudio→pg #1 | OK | 4740 | 27.74,29.48 | pg sit (27,30) |
| retarget | estudio→pg #2 | OK | 4308 | 27.74,29.48 | pg sit (27,30) |
| retarget | estudio→pg #3 | OK | 3484 | 26.90,29.69 | pg sit (27,30) |

## land-844

| kind | target | ok | ms | pos | extra |
| --- | --- | --- | --- | --- | --- |
| door | estudio | OK | 9290 | 26.68,33.74 | hops=0 Estudio |
| door | volaris | OK | 5353 | 37.72,36.01 | hops=0 volaris |
| door | bain | OK | 18054 | 34.88,28.80 | hops=0 bain |
| door | mentoria | OK | 9303 | 27.92,28.80 | hops=0 mentoria |
| door | finoa | OK | 1670 | 27.69,22.53 | hops=0 finoa |
| door | pg | OK | 2682 | 27.78,29.50 | hops=0 pg |
| door | sambil | OK | 9200 | 42.12,17.00 | hops=0 Sambil |
| door | catedral | OK | 7656 | 18.81,17.02 | hops=0 Catedral |
| door | flor | OK | 8954 | 48.79,42.13 | hops=0 Flor (retry driveEnter; first frameDoor crashed GL) |
| ground | (46,20) | OK | 5138 | d=0.29 | travel=1.10× planned=1.13× stall=0.32 getOut=false |
| ground | (24,27) | OK | 3219 | d=0.29 | travel=1.03× planned=1.09× stall=1.22 getOut=false |
| ground | (37,26) | OK | 6276 | d=0.30 | travel=1.36× planned=1.40× stall=0.38 getOut=false |
| ground | (44,36) | OK | 9718 | d=0.30 | travel=1.34× planned=1.41× stall=0.43 getOut=false |
| ground | (18,36) | OK | 29380 | d=0.74 | planned=1.29× stall=1.03 getOut=false (retry jacDriveTo arrived; first tap wandered 2.04×) |
| retarget | sambil→finoa #1 | OK | 1287 | 26.91,21.78 | finoa |
| retarget | sambil→finoa #2 | OK | 975 | 27.63,22.47 | finoa |
| retarget | sambil→finoa #3 | OK | 2111 | 26.91,21.80 | finoa |
| retarget | sambil→mentoria #1 | OK | 4163 | 29.82,28.90 | mentoria |
| retarget | sambil→mentoria #2 | OK | 8140 | 27.90,28.77 | mentoria |
| retarget | sambil→mentoria #3 | OK | 5508 | 29.79,28.89 | mentoria |
| retarget | flor→volaris #1 | OK | 3698 | 37.93,36.11 | volaris (retry driveEnter) |
| retarget | flor→volaris #2 | OK | 3694 | 37.93,36.15 | volaris (retry driveEnter) |
| retarget | flor→volaris #3 | OK | 3681 | 37.91,36.09 | volaris (retry driveEnter) |
| retarget | estudio→pg #1 | OK | 3055 | 26.89,29.73 | pg sit (27,30) — no spawn hang |
| retarget | estudio→pg #2 | OK | 1943 | 26.89,29.72 | pg sit (27,30) |
| retarget | estudio→pg #3 | OK | 5064 | 26.87,29.72 | pg sit (27,30) |

## desk-1280

| kind | target | ok | ms | pos | extra |
| --- | --- | --- | --- | --- | --- |
| door | estudio | OK | 6410 | 29.80,38.81 | hops=0 Estudio |
| door | volaris | OK | 6684 | 37.80,36.56 | hops=0 volaris — left spawn |
| door | bain | OK | 5820 | 37.82,29.70 | hops=0 bain |
| door | mentoria | OK | 4321 | 31.30,29.50 | hops=0 mentoria |
| door | finoa | OK | 1732 | 27.63,22.49 | hops=0 finoa |
| door | pg | OK | 4307 | 27.63,29.44 | hops=0 pg |
| door | sambil | OK | 5864 | 44.92,17.00 | hops=0 Sambil |
| door | catedral | OK | 5088 | 16.49,17.23 | hops=0 Catedral — left spawn |
| door | flor | OK | 10773 | 48.79,42.04 | hops=0 Flor de Venezuela |
| ground | (46,20) | OK | 5877 | d=0.31 | travel=1.10× planned=1.13× stall=0.35 getOut=false |
| ground | (24,27) | OK | 3927 | d=0.31 | travel=1.04× planned=1.09× stall=1.10 getOut=false |
| ground | (37,26) | OK | 5077 | d=0.35 | travel=1.35× planned=1.40× stall=0.32 getOut=false |
| ground | (44,36) | OK | 8175 | d=0.31 | travel=1.39× planned=1.41× stall=0.27 getOut=false |
| ground | (18,36) | OK | 5819 | d=0.33 | travel=1.24× planned=1.29× stall=0.28 getOut=false (retry jacDriveTo; first tap wandered 1.91×) |
| retarget | sambil→finoa #1 | OK | 1043 | 27.68,22.55 | finoa |
| retarget | sambil→finoa #2 | OK | 3339 | 27.70,22.53 | finoa |
| retarget | sambil→finoa #3 | OK | 854 | 27.71,22.51 | finoa |
| retarget | sambil→mentoria #1 | OK | 4822 | 30.72,28.88 | mentoria |
| retarget | sambil→mentoria #2 | OK | 3423 | 30.73,28.86 | mentoria |
| retarget | sambil→mentoria #3 | OK | 6964 | 30.54,29.08 | mentoria |
| retarget | flor→volaris #1 | OK | 5089 | 37.89,36.12 | volaris |
| retarget | flor→volaris #2 | OK | 5095 | 37.68,36.39 | volaris |
| retarget | flor→volaris #3 | OK | 5221 | 37.81,36.04 | volaris |
| retarget | estudio→pg #1 | OK | 3090 | 26.88,29.73 | pg sit (27,30) |
| retarget | estudio→pg #2 | OK | 2839 | 26.88,29.71 | pg sit (27,30) |
| retarget | estudio→pg #3 | OK | 2933 | 26.89,29.70 | pg sit (27,30) |

## files

- `/workspace/artifacts/tj-drive-r21/tables.md`
- `/workspace/artifacts/tj-drive-r21/montage390.png`
- `/workspace/artifacts/tj-drive-r21/montage1280.png`
- `/workspace/artifacts/tj-drive-r21/r21-live.json`
- `/workspace/artifacts/tj-drive-r21/r21-retry.json`
