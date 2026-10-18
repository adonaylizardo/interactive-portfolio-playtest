# r22 sequential real-tap (local `index-D9SjIfna.js`)

base: http://127.0.0.1:4302/interactive-portfolio-playtest/preview/
probed: 2026-10-18T11:32–11:49Z, one session per width, real taps only (no driveEnter).

HIGH 1 Estudio→Volaris leftover stall is gone: the van no longer sits at (30.5, 39.0).
844 Estudio→Volaris arrived in 3.6–3.9 s at ~(37.9, 40.2). Phone 390 arrived in 4.6–6.9 s.
The east corridor from the Estudio stoop was being trimmed away; watchdog now also fires on 0 mph / no tile progress (vel flicker ignored).

MED 2: 10 one-finger ~170 px / 200 ms drags at zoom 0.12 in D — 0 van moves, 0 goal sets (390, 844, 1280).
LOW 3: pickAt van @ 0.12 — jac=true, door=null (390, 844, 1280).

Volaris get-out opens the case preview with the avatar on (39,36) rather than the room; Salir on that preview is flaky in software-GL. 1280 first Estudio tap still misses after board (Pixi mouse path). Those are harness / walk-in, not the leftover stall.

| width | estudio | volaris | pan 10-drag | pick van @ 0.12 |
| --- | --- | --- | --- | --- |
| phone-390 | OK ~7–13 s @(26.7,33.6) interior | OK drive ~5–7 s, preview at door | OK | jac |
| land-844 | OK ~7–14 s | OK drive 3.6 s @(37.9,40.2) | OK | jac |
| desk-1280 | tap-miss at spawn (harness) | — | OK | jac |
