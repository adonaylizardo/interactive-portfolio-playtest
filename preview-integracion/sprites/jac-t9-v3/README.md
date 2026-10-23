# JAC T9 — v3

**Estado:** EN EL MAPA. Adonay aprobó la forma, las 4 direcciones y la colocación. Parqueada en S=(27,18) mirando a SE, huella 4×2, solo el frame `apagado_se` (luces apagadas).

- **v3 (vigente):** `manifest.v3.json` + carpeta `v3/`.
- **v2 (superseded):** `manifest.json` y los `jac-t9__*.png` de esta carpeta. Se dejan para referencia y no se borraron.

## Qué trae v3
- 4 direcciones: **SW, SE** (de frente) y **NE, NW** (de espaldas).
- Hoja por dirección (`v3/jac-t9-v3__hoja_<dir>@2x.png` / `@1x`): 3 filas (`apagado`, `luces`, `freno`) × 4 columnas (frames de rueda 0–3).
- Fijos por variante: `v3/jac-t9-v3__<variante>_<dir>@2x.png`.
- Capas de luz sueltas en `v3/capas/` (cono en el suelo, núcleo y halo de faros, cola y freno) para componer en el motor.
- Celda @2x de 560×384 con **ancla (280,180)**, que es el centro de la huella **4×2** a nivel del suelo y es igual en las 4 direcciones. En @1x la celda es de 280×192 y el ancla queda en (140,90).
- Escala: el largo real (5,0 m) es 2,8× la altura de Adonay (1,78 m, 96 px @2x), o sea ≈270 px @2x a lo largo del eje iso (≈3,8 tiles → huella 4×2).
- Luces: dos conos, uno por faro. Cada uno arranca en su faro y sigue el rumbo iso, abriéndose un poquito.
- Ruedas: el loop es de 4 frames y rota 15° por frame los rayos del rin (6 rayos). Los cauchos no se tocan.
- Parqueo: celda S = (27,18), mirando a SE. Huella (24,17) 4×2. Activa.

## QA
- `/workspace/portfolio/qa/relleno/jac-t9-v3-hoja.png`
- `/workspace/portfolio/qa/relleno/jac-t9-v3-ruedas.gif`
- Scripts: `/workspace/portfolio/qa/relleno/jac-t9-v3-src/`
