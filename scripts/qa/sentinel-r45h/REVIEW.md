# Revisión adversarial de código: r45h (d2bd630, PR #20, cursor/integracion)

Sentinel 🛡️, sábado 21/11/2026 (hora de Caracas, UTC-4). Solo lectura: clon en /tmp/sent-r45h, sin push, sin PR y sin comentarios.
Comparé contra r45g (1cbcac6) y r45d (6995f7a).

## Método
- Arnés headless en Node: la clase **real** `JacT9` de d2bd630, empaquetada con esbuild y con `pixi.js` sustituido por un stub. Usa el mapa real (`src/data/map`).
- Llamo a `update(dt, {dx,dy})` con dt = 1/60, 0.1 y 0.25 s. 0.25 es `MAX_FRAME_DT` y equivale a un teléfono lento o a un tirón de la pestaña.
- El mismo arnés corre contra r45g (worktree en /tmp/sent-r45g) como línea base.
- Scripts y diffs de los experimentos: `harness/` (`h1`, `ov`, `h3b`, `park`, `arrive`, `vol2`, `tr`, y `exp*.bundle.diff`).
- No es navegador: no hay input real ni render. Las conclusiones de la lógica de movimiento y del planner son directas. Las de HUD/velocímetro se infieren del código.

Leyenda: **[REPRO]** reproducido en el arnés · **[CÓDIGO]** verificado leyendo el código · **[INFERIDO]** sin prueba directa.

## 1. Causa raíz por regresión

### HIGH-1: giro de 90° solo, de frente contra pared o prop. [REPRO][CÓDIGO]
**Hipótesis de Forge: CONFIRMADA en parte.** No es la "resolución de colisión" genérica. La rama de escape con gas recto **cambia la faceta (yaw) a propósito**.
- `jacT9.ts:2834-2845` (stepManual). El comentario dice "Straight gas into a prop never rotates", pero el código hace lo contrario:
  ```ts
  const straight = gas && (D||R) && pinnedNow && Math.abs(this.steering) <= CREEP_MIN_STEER;
  if ((gas && steerHard && ... && pinnedNow) || straight) { this.applyPinnedEscape(dt, dirSign); ...
  ```
- `applyPinnedEscape`:
  - `:3187`: con el volante centrado elige un lado igual: `const prefer = (yawing ? steer : 1) * dirSign || 1;`
  - `:3236`: el primer candidato es la caja ya rotada en el mismo sitio: `pushClear(this.cx, this.cy, want)`.
  - `:3294-3304` y `accept` en `:3275-3279`: `this.dir = useDir; this.heading = dirIndex(useDir);`. Es un salto de 90° en un cuadro, con 0 de avance.
  - Después, `releaseEscapeLatch` (`:3147`, `spun && clear`) suelta el latch y el gas lo lleva pegado a la pared.
- `travelSinceDir` llega grande tras la aproximación (`:1508-1509`), así que el filtro `DIR_TRAVEL_MIN` (`:3296`) no lo frena.
- Medido, gas recto (stick arriba, dx = 0) desde 816 poses legales:

| | dt 1/60 | dt 0.1 |
|---|---|---|
| r45h, corridas con cambio de faceta sin volante | **603/816** | **602/816** |
| r45g | **0** | **0** |

### MED-2: desliz lateral de 0.34 en el cuadro del impacto. [REPRO][CÓDIGO]
- Es el mismo mecanismo que HIGH-1. Los sub-pasos primero avanzan con la faceta vieja y después `accept` cambia la faceta dentro del mismo cuadro.
- El guard de `:3299` solo mira `escapeFrameMoved` (avance del escape), no el avance normal anterior en ese cuadro.
- La proyección al eje del sprite (`:1434`) se salta porque `escapeKept = true`.
- Medido a dt 0.1: el desplazamiento lateral máximo respecto al sprite nuevo es **0.343**. Con 60 fps es 0. En r45g es 0.

### NUEVO, ALTO: el no-clipping de r45h depende de los FPS. [REPRO][CÓDIGO]
Forge midió G9 = 0 con fps altos. Pero hay cuadros que **terminan con la caja solapada** (gas ± volante, poses cada 4 tiles):

| fps | r45h | r45g |
|---|---|---|
| 60 | 0 | 0 |
| 10 (dt 0.1) | **10** | 0 |
| 4 (dt 0.25) | **45** | 0 |

Causas:
- `:3353`, `pullFrameLegal`: `if (this.escapeKept) return;`. No corrige aunque `:1486` haya entrado porque la pose está bloqueada.
- `:1473-1479`: el recorte por `hopLim` escala la pose hacia x0 **sin revisar `poseBlocked`**. Además, x0 con la faceta nueva puede estar bloqueado.
- La faceta cambia dentro del cuadro y los sub-pasos siguientes siguen trasladando.

### HIGH-2a: Bain no arranca y el conductor se baja. [REPRO][CÓDIGO]
**Hipótesis de Forge (footprint o margen distinto en el planner): REFUTADA para Bain.** El planner usa el mismo `poseBlocked`.
- `jacT9.ts:902-905`: el pool se recorta a `front` (6 sitios) **antes** de comprobar alcanzabilidad, y no hay fallback por niveles.
  ```ts
  const pool = front.length ? front : closeEnough.length ? closeEnough : doorSide.length ? doorSide : usable;
  ```
- Los 6 sitios `front` (39–41, 29–30) son inalcanzables para la caja 5×3: `footprintPath` da 0/6.
  - r45g sí "llegaba" a (39,29), pero con solape de hasta 7 celdas, o sea, atravesando.
- Resultado: `:942-944` devuelve null y `scene.ts:2897-2900` llama a `jacGetOut({thenEnter:true})` en el spawn.
- Hay sitios del lado de la puerta que sí son alcanzables: 8/22 en `closeEnough`. El más cercano es (43,26), a 4 tiles de la puerta, con una ruta de 63 nodos.
- `TAP_BFS_BUDGET = 1` no es la causa: lo subí a 9999 y sigue en null.

### HIGH-2b: Volaris da la vuelta de 71 tiles y se tranca en (55.9, 41.05). [REPRO exacto][CÓDIGO]
**Hipótesis de Forge: CONFIRMADA en parte.** Es el mismo footprint con **distinta tolerancia**: el planner valida centros enteros y el seguidor queda descentrado.
- `:2156` (alignTurn) permite el giro con 0.18 de error: `if (Math.abs(along) > 0.18) return;`. `:3529` (commitFacing) hace lo mismo: `turn.dist > 0.18`.
- En el giro se→sw en (56,6) cambia de faceta en x = 55.851, o sea, 0.149 fuera del carril. Así recorre todo el carril x = 56.
- `footprintCellsAt` (`:2730-2736`) usa `FOOT_EPS = 0.05` (`:116`). Con 0.149 de desvío, la caja de 3 de ancho ocupa **4 columnas** (54–57).
  - En y ≈ 41.1, la celda (54,44) bloquea: `poseBlocked(55.85, 41.15, sw) = 1`, mientras que `poseBlocked(56, 41.15, sw) = 0`.
- El error lateral nunca se corrige. El nudge de `:1695-1697` solo empuja a lo largo del eje del sprite, por la regla de los 35°.
- La ruta de 109 nodos sí es la más corta legal con el modelo 5×3: no es un bug del planner.
- `noteFollowProgress` y `goalBest` (`:2385-2448`) **no son la causa**: solo detectan el atasco. En Node se rinde a los ~17 s y en el navegador a los 32–40 s (más lento).

### HIGH-3: oscilación de ~0.9 tiles con rumbo congelado contra un prop. [REPRO][CÓDIGO]
**Es preexistente, no es regresión de r45h.**
- Misma métrica en r45g y r45h: en los acercamientos al porche y al cactus, ~40 % de las corridas oscilan.
  - Porche: 58/148 en r45h vs 65/148 en r45g. Cactus: 59/132 vs 56/132.
- Traza (28,23,se) con volante a la derecha:
  - El heading queda clavado en 0.62, que es `HEADING_CAP`.
  - `swapBlocked = 1` porque la caja rotada en la pose actual está bloqueada (`rotBlk` 2–3). Eso viene de `syncManualFacing :2805-2806`.
  - Avanza ~0.95 tiles, `nosePinned` lo detecta y `applyPinnedEscape` retrocede.
  - La búsqueda de una pose rotada libre solo llega a `ESCAPE_CLEAR_TILES = 0.6` (`:3237`).
  - `releaseEscapeLatch :3147` suelta al recorrer `ESCAPE_LATCH_TILES = 1` aunque la caja rotada siga sin caber.
  - Vuelve a avanzar y repite. No guarda memoria entre ciclos.

### MED-1: velocidad reportada falsa. [CÓDIGO], con métrica en el arnés
- Lugares donde se fuerza `vel` sin relación con la traslación:
  - `:3274` `this.vel = nextSign * (this.escapeSlowT > 0 ? 0.4 : CREEP_TILES_PER_S)` y `:3326` (pinned a 0.4)
  - `:1452` `max(|vel|, 0.05)`
  - `:1462` y `:1464` (±0.06), `:1467` (`vel = -vel`)
  - `:1668` (0.4), `:2140`
- `syncMeters :1973-1987` ignora `_movedTiles` y pinta mph a partir de `vel`. Con `speed < 0.55` muestra mph = 0, así que 0.4 forzado se ve como 0 aunque se mueva.
- Cuadros con |vel − desplazamiento/dt| > 0.5 t/s, a 60 fps, cerca del porche y el cactus: **26 % en r45h vs 6 % en r45g**.

## 2. Plan de arreglo (no aplicado)

Probé un parche mínimo en el bundle del arnés (A + B + E, en `harness/expABE.bundle.diff`):

| Prueba | r45h | Con el parche |
|---|---|---|
| Auto-giros con gas recto | 603 | **0** (ambos dt) |
| Desliz lateral al impacto | 0.34 | **0** |
| Cuadros solapados a 60 / 10 / 4 fps | 0 / 10 / 45 | **0 / 0 / 0** |
| Volaris | no llega | **llega en 23.8 s** (60 fps) y 24.3 s (10 fps), 108 tiles, 0 solape |
| Sitio Bain (43,26) | no llega | **llega en 13.3 s**, 0 solape |
| (23,7) | — | sigue llegando en 1.5 s, 0 solape |

HIGH-3 y MED-1 no cambian con ese parche: necesitan C y D.

**A. Sin yaw por colisión (HIGH-1, MED-2).** En `stepManual`, quitar `|| straight`:
```ts
if (straight && !this.escapeLatch) { this.noteBump(Math.abs(this.vel)); this.vel = 0; return; }
if (gas && steerHard && (D||R) && pinnedNow) { applyPinnedEscape(...) }
```
En `applyPinnedEscape`, `prefer` sin volante → return. Regla general: `dir` y `heading` solo cambian si |steer| > 0.08. Nunca usar `accept(useDir ≠ dir)` por un choque recto.

**B. Giro de ruta centrado (HIGH-2b).**
- `alignTurn :2156` y `commitFacing :3529`: tolerancia ≤ `FOOT_EPS` (0.04).
- Mejor aún: al aceptar el giro, fijar la coordenada transversal del nuevo tramo al entero del nodo, solo si `poseBlocked` = 0 ahí. Es un snap ≤ 0.18 dentro del cuadro de giro.
- Alternativa: validar la caja en el planner con margen (x ± 0.2), pero eso estrecha rutas.

**C. Planner de sitio por alcanzabilidad (HIGH-2a).**
- En `parkForDoor :902-905`: un solo BFS multi-objetivo de `footprintPath` desde la camioneta, filtrar `usable` por alcanzables y **después** aplicar la cascada front → closeEnough → doorSide.
- Si no hay ninguno alcanzable: aviso "No se puede llegar" en < 1 s. Bajarse solo si la camioneta está a ≤ 6 tiles de la puerta. Cambiar `scene.ts:2897-2900` para que no llame `jacGetOut` en el spawn.

**D. Invariante de fin de cuadro (clipping a bajos FPS).**
- En `update`, guardar `legal = {x, y, dir, heading}` tras cada sub-paso que termine con `poseBlocked = 0`.
- Cortar el bucle de sub-pasos en cuanto cambie `dir`.
- Antes de `syncMeters`: `if (poseBlocked(end) > 0) restaurar legal, vel = 0`.
- Quitar `if (this.escapeKept) return;` de `pullFrameLegal :3353` y hacer que el recorte `hopLim :1473` cheque `poseBlocked` (si no cabe, usar `legal`).

**E. Escape con volante (HIGH-3).**
- La búsqueda de pose rotada debe retroceder por el eje hasta 2.5–3 tiles (no 0.6), y también probar un paso lateral.
- Si encuentra pose: maniobra de tres puntos (retroceder hasta esa pose y girar ahí).
- Si no: parar y mostrar el aviso de volante (`steerCue`), sin volver a avanzar con el mismo gas.
- No soltar el latch por "1 tile recorrido" si la caja rotada sigue sin caber. Agregar un contador: más de 2 ciclos sin cambio de faceta → stop + aviso.

**F. Velocidad honesta (MED-1).**
- Al final de `update`: `vel` reportada = desplazamiento con signo a lo largo del sprite / frame. Mantener aparte la velocidad interna del integrador, si hace falta.
- Borrar `escapeSlowT` y todos los `vel = 0.4 / 0.06 / -vel` usados para pasar gates.
- `syncMeters` debe usar `movedTiles / dt`.

## 3. Checklist de verificación (1440 y 375; en el arnés, además, dt 1/60, 0.1 y 0.25)
1. **G9**: 0 cuadros que terminan con `poseBlocked > 0` a 60/10/4 fps. Con `ov.mjs` (gas ± volante, poses cada 4 tiles): 0/0/0. En el navegador: hostile, fbprobe y park4.
2. **Auto-giro**: 0 cambios de faceta con |steer| ≤ 0.08 (`h1.mjs`, 816 poses). En el navegador: 0 saltos de rumbo ≥ 0.9 cuartos de vuelta en un cuadro sin volante.
3. **Desliz al impacto**: 0 cuadros con ≥ 0.15 tiles a más de 35° del sprite. Lateral en el cuadro de swap ≤ 0.05.
4. **Oscilación**: 0 ventanas de 3 s con gas+volante dentro de una caja de 1.5 tiles, con |Δheading| < 0.33 y recorrido > 0.5 (`h3b.mjs` porche/cactus: hoy 58 y 59). Si no puede girar: parado y con el aviso.
5. **Tap-park**:
   - (23,7): 10/10, ≤ 2 s.
   - Volaris: llega en ≤ 30 s (hoy 24 s con B), con ruta ≤ 110 tiles.
   - Bain: llega a un sitio alcanzable del lado de la puerta (≤ 6 tiles de la puerta) en ≤ 30 s. Nunca se baja en el spawn.
   - Inalcanzable (22,18): aviso ≤ 0.4 s.
   - En todos: 0 solape y 0 spins.
6. **Velocímetro**: |vel − desplazamiento/dt| ≤ 0.1 t/s en ≥ 99 % de los cuadros. mph = 0 solo si el desplazamiento es < 0.01 por cuadro.
7. **Regresión**: los gates r45d y G1–G9 del agente en ambos tamaños. Sin gates "satisfechos" editando la `vel` reportada.
