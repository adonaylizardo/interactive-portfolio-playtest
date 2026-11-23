# Primera persona · paquete v2 (BORRADOR · 17 oct 2026)

**Estado: BORRADOR.** Nada está APROBADO. No se tocó `indice.json` y no cambió el estado de ningún otro asset. La v2 amplía la propuesta v1 (y suma el **frame C**, en **tercera persona over-the-shoulder** junto a la JAC T9 estacionada): cabina fiel al JAC T9 real, volante suelto, cabina apagada, Ávila en tile, cruce y plaza, árbol y banco definitivos (Estilo C) y las 8 fachadas que faltaban.

- Frames: `frames/frame-a-a-pie@1x|@2x.png`, `frames/frame-b-jac-t9@1x|@2x.png` (re-renderizados en v2) y `frames/frame-c-a-pie-junto-t9@1x|@2x.png` (nuevo)
- Piezas: `piezas/` (34 entradas en `piezas.json`; la lista v1 queda en `piezas.v1.json`)
- Copia de lo que había en v1: `_v1/frames`, `_v1/piezas`, `README.v1.md`, `src/ambar.v1.json`
- Código: `src/build_primera_persona.py` (base v1), `src/v2_cabina.py` (cabina + volante), `src/v2_piezas.py` (fachadas, props, Ávila, suelos), `src/build_v2.py` (exporta todo y los frames), `src/gen_piezas_v2.py` (escribe `piezas.json`), `src/hoja_qa_v2.py`, `src/v2_t9ext.py` (T9 exterior), `src/build_frame_c.py`, `src/hoja_qa_frame_c.py`
- Ámbar y bordes por imagen: `src/ambar-v2.json`, `src/qa-v2.json`
- Hojas de QA: `/workspace/portfolio/qa/primera-persona/paquete-v2.png` y `/workspace/portfolio/qa/primera-persona/frame-c-t9.png` (frame C v3 en 3ª persona + T9 re-proyectada + Adonay de espaldas; la hoja anterior rechazada quedó como `frame-c-t9.v1-rechazado.png`)
- Las fotos de referencia del interior (`jac-cabina/`) se usaron solo para mirar. No aparecen en ninguna pieza, frame ni hoja.

Reconstruir: `cd src && python3 build_v2.py && python3 build_frame_c.py && python3 gen_piezas_v2.py && python3 hoja_qa_v2.py && python3 hoja_qa_frame_c.py` (aprox. 1 min).

## 1. Técnica recomendada

**Planos de fachada frontales + calle pseudo-3D, en PixiJS v8 y sin motor 3D.**

| Capa | Qué es | Cómo se dibuja en Pixi |
|---|---|---|
| 0 cielo | tile 2048×400 (degradado y estrellas) | `TilingSprite` fijo. Solo se desplaza en x con el giro |
| 1 cerros (El Ávila) | tile 2048×128 sin costura | `TilingSprite`. No se mueve al caminar; con el giro se desplaza igual que el cielo |
| 2 suelo | avenida, aceras, cruce, plaza | `Graphics` con polígonos del plano y=0 proyectados en cada frame (son unas 30 caras). Las franjas `suelo-avenida` a/b se alternan cada 3 m de z y dan el efecto OutRun de velocidad |
| 3 fachadas | un plano frontal por edificio | `Sprite` con ancla centro-inferior, `scale = f/(z·16)`, `zIndex = −z` y un tinte de niebla según z |
| 4 props | farol, banco, árbol | Billboards por distancia, igual que las fachadas. Los halos van aparte en modo `add` |
| 5–6 overlays | capó + cabina del JAC T9 | Sprites fijos a la cámara (solo en modo carro) |
| 7 volante | volante suelto del T9 | Sprite fijo a la cámara en (640, 610) con ancla en el cubo; rota al doblar |

**Por qué funciona.** Un plano paralelo a la imagen se proyecta sin deformarse: solo cambian la escala y la posición. Por eso una fachada que mira a la cámara queda geométricamente exacta como sprite escalado, aunque esté a un lado. Basta con dos fórmulas:

```
x_pantalla = 640 + (x − cam.x) · f / z
y_pantalla = 360 − (y − ojo) · f / z        (f = 914 px @1x → FOV horizontal 70°, horizonte = ojo)
```

El suelo usa la misma proyección: para cada fila y > 360, z = f·ojo/(y−360). En la hoja de QA, los postes de 1,78 m (a pie) y 1,45 m (JAC) tocan el horizonte justo, y todas las fugas llegan al PF (640, 360).

**Restricción que lo mantiene honesto.** La cámara mira por los ejes de la grilla del mapa (N/E/S/O) y gira en saltos de 90° con una transición corta (barrido o fundido de unos 250 ms), como en un dungeon crawler. Encaja con un mapa isométrico que ya tiene 4 direcciones. Al caminar se avanza en z y se desliza en x. Para disimular se puede añadir un balanceo de ±3° (desplazar las capas en x según su z) sin romper la ilusión. Cada edificio necesita como mucho una fachada por cada calle desde la que se ve.

**Por qué conviene:**
- Reusa la tubería actual (PIL con supersampling ×4). En v2 la reducción a @1x es un BOX exacto con alfa premultiplicado (sin halos) y el @2x sale NEAREST del @1x, la paleta y el trazo de 1 px. El arte sigue siendo 2D y se dibuja en código.
- En Pixi cuesta muy poco: unos 10 a 30 sprites, un `Graphics` y 2 overlays. No necesita depth buffer ni shaders propios.
- El agente de código ya tiene `Container`, `zIndex` y `sortableChildren`. Agregar el modo es una escena nueva.

**Opción intermedia, si después piden más libertad.** Pixi v8 trae `PerspectiveMesh` (a partir de 8.1). Con él, la misma textura de una fachada se puede pegar como pared lateral en escorzo, al estilo Wolfenstein. Así aparecerían los costados de la calle sin un motor 3D. Queda fuera del alcance mínimo.

**Alternativa descartada por ahora: Three.js low-poly.** A favor: giro libre, volúmenes reales y luces de verdad. En contra:
- Habría que remodelar en 3D cada edificio. El arte isométrico y frontal no se reusa.
- Para lograr el look pixel hace falta un render target de baja resolución, una cuantización a la paleta y un control del ámbar por post-proceso.
- Suma unos 150 KB gz de `three`, más un segundo contexto WebGL o la integración con Pixi.
- Cuesta más en móvil y deja dos motores que mantener.

Conviene solo si el giro libre se vuelve un requisito. Mientras tanto, los planos más el suelo proyectado dan el 90 % de la sensación por el 10 % del costo.

## 2. Piezas (viewport 1280×720 @1x, horizonte y=360, 16 px/m)

Ancla de fachadas y props: **centro-inferior** (pie del edificio en la última fila). En Pixi: `anchor = (ancla.x/w, ancla.y/h)`, `scale = f/(z·16) = 57,125/z`, `zIndex = −z`. Las fachadas vienen en dos variantes: luz encendida y luz apagada (ámbar enc. / apag.).

| Pieza | @1x | @2x | Metros (ancho × alto) | Ancla px @1x | Pixi · capa · zIndex | Ámbar |
|---|---|---|---|---|---|---|
| cielo-noche | 2048×400 | 4096×800 | — | [0, 360] | TilingSprite · capa 0 · z fondo, -1e9 | 0,00 % |
| **cerros-avila** | 2048×128 | 4096×256 | — | [0, 126] | TilingSprite · capa 1 · z fondo, -1e8 | 0,00 % |
| suelo-avenida__fase-a | 512×8 | 1024×16 | 32 m × 3 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo, bajo todo | 0,00 % |
| suelo-avenida__fase-b | 512×8 | 1024×16 | 32 m × 3 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo, bajo todo | 0,00 % |
| **suelo-cruce__cebra** | 512×8 | 1024×16 | 32 m × 0.5 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo | 0,00 % |
| **suelo-cruce__pare** | 512×8 | 1024×16 | 32 m × 0.5 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo | 0,00 % |
| **suelo-cruce__calle** | 512×8 | 1024×16 | 32 m × 0.5 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo | 0,00 % |
| **suelo-cruce__calle-eje** | 512×8 | 1024×16 | 32 m × 0.5 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo | 0,00 % |
| **suelo-acera-frente** | 512×8 | 1024×16 | 32 m × 0.5 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo | 0,00 % |
| **suelo-plaza__fase-a** | 512×8 | 1024×16 | 32 m × 3 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo | 0,00 % |
| **suelo-plaza__fase-b** | 512×8 | 1024×16 | 32 m × 3 m | [256, 0] | Graphics (proyectado cada frame) · capa 2 · z suelo | 0,00 % |
| **suelo-cruce__planta** | 512×512 | 1024×1024 | 32 m × 32 m | [256, 256] | referencia / textura opcional · capa 2 · z suelo | 0,00 % |
| **suelo-plaza__planta** | 256×256 | 512×512 | 16 m × 16 m | [0, 0] | referencia / textura opcional · capa 2 · z suelo | 0,00 % |
| fachada-teresa-carreno | 1040×614 | 2080×1228 | 65 m × 38.2 m | [608, 613] | Sprite · capa 3 · z −z | 2,87 % / 0,00 % |
| fachada-biblioteca-ingenieria | 468×185 | 936×370 | 29.2 m × 11.4 m | [234, 184] | Sprite · capa 3 · z −z | 1,78 % / 0,00 % |
| fachada-catedral-de-barquisimeto | 736×588 | 1472×1176 | 46 m × 36.6 m | [368, 587] | Sprite · capa 3 · z −z | 1,76 % / 0,00 % |
| **fachada-flor-de-venezuela** | 679×329 | 1358×658 | 42.4 m × 20.4 m | [339, 328] | Sprite · capa 3 · z −z | 3,90 % / 0,00 % |
| **fachada-sambil-barquisimeto** | 1351×559 | 2702×1118 | 84.4 m × 34.8 m | [675, 558] | Sprite · capa 3 · z −z | 0,52 % / 0,00 % |
| **fachada-estudio-6x6** | 298×97 | 596×194 | 18.6 m × 5.9 m | [149, 96] | Sprite · capa 3 · z −z | 1,18 % / 0,00 % |
| **fachada-casa-volaris** | 205×194 | 410×388 | 12.8 m × 12.0 m | [102, 193] | Sprite · capa 3 · z −z | 1,75 % / 0,00 % |
| **fachada-casa-bain** | 202×201 | 404×402 | 12.6 m × 12.4 m | [101, 200] | Sprite · capa 3 · z −z | 1,13 % / 0,00 % |
| **fachada-casa-mentoria** | 218×108 | 436×216 | 13.6 m × 6.6 m | [109, 107] | Sprite · capa 3 · z −z | 1,66 % / 0,00 % |
| **fachada-casa-finoa** | 202×143 | 404×286 | 12.6 m × 8.8 m | [101, 142] | Sprite · capa 3 · z −z | 0,88 % / 0,00 % |
| **fachada-casa-pg** | 202×159 | 404×318 | 12.6 m × 9.8 m | [101, 158] | Sprite · capa 3 · z −z | 2,52 % / 0,00 % |
| farol-frente | 24×76 | 48×152 | 1.5 m × 4.6 m | [6, 75] | Sprite · capa 4 · z −z | 2,68 % |
| **arbol-cuji-frente** | 125×108 | 250×216 | 7.8 m × 6.6 m | [62, 107] | Sprite · capa 4 · z −z | 0,00 % |
| **banco-frente** | 32×18 | 64×36 | 2.0 m × 1.0 m | [16, 17] | Sprite · capa 4 · z −z | 0,00 % |
| jac-t9-capo | 1280×720 | 2560×1440 | — | [0, 0] | Sprite · capa 5 · z 5 (sobre el mundo) | 0,00 % |
| **jac-t9-cabina__luces-on** | 1280×720 | 2560×1440 | — | [0, 0] | Sprite · capa 6 · z 6 | 0,00 % |
| **jac-t9-cabina__luces-off** | 1280×720 | 2560×1440 | — | [0, 0] | Sprite · capa 6 · z 6 | 0,00 % |
| **jac-t9-volante** | 464×426 | 928×852 | 0.38 m | [232, 232] | Sprite · capa 7 · z 7 (sobre la cabina) | 0,00 % |

| **jac-t9-ext__34-frontal-3p__apagado** (v3, reemplaza lado/trasera/frente) | 308×221 | 616×442 | 5.33 × 1.96 × 1.84 m | [89, 236] (esquina delantera-pasajero en el suelo) | Sprite · capa 4 · z −8,2 · específico de la pose del frame C | 0,00 % |
| **adonay-espalda** (+ `__idle` 2 frames, `__walk` 4 frames) | 192×300 por frame | 384×600 | 1.78 m | [96, 296] → anchor (0,5, 0,9867) | Sprite / AnimatedSprite · capa 8 · fijo abajo-centro | 15,83 % (ropa, ver 3b) |

En **negrita**, lo nuevo o reemplazado en v2. Teresa, Biblioteca, Catedral, farol y capó se re-exportaron con la tubería nueva, sin cambios de dibujo.

### Cómo usar las piezas nuevas
- **Volante.** `jac-t9-volante` va en la capa 7, en (640, 610) @1x, con `anchor = (0,5, 0,5446)` (cubo = px 232,232). Al doblar rota hasta ±90° y vuelve. En el frame B, el fondo achatado y la U inferior quedan bajo el borde (y > 720); al rotar entran en cuadro, por eso la pieza está completa.
- **Cabina.** `luces-on` y `luces-off` son overlays de 1280×720 sin volante. Se cambia una por otra al encender o apagar. Las palancas están en el overlay porque no rotan.
- **Ávila.** `TilingSprite` de 2048×128 colocado en y = 234 (su fila 126 cae en el horizonte). `tilePosition.x` se mueve con el giro, igual que el cielo.
- **Cruce.** Al acercarse a una esquina, las filas del suelo cambian de franja: `suelo-cruce__pare`, luego `__cebra` (2,7 m), luego `__calle` y `__calle-eje` a lo ancho de la transversal (12 m), otra vez `__cebra` y por último `suelo-acera-frente`. Los polígonos exactos en metros están en `piezas/suelo-cruce__spec.json` y se proyectan con `Graphics`, igual que la avenida. `suelo-cruce__planta` es la referencia cenital a 16 px/m.
- **Plaza.** Franjas `suelo-plaza__fase-a` (con junta) y `__fase-b`, alternando cada 2 m de z. `suelo-plaza__planta` es el tile cenital sin costura.

## 3. Frames

- **(a) A pie.** Ojo a 1,78 m en la acera derecha. Es la misma calle que en v1, ahora con el Ávila en tile, el cují en Estilo C y el banco nuevo. Se re-renderizó porque cambiaron piezas compartidas. **Ámbar: 0,26 % @1x.**
- **(b) JAC T9.** Ojo a 1,45 m, en el puesto izquierdo del carril derecho. Lleva escena, capó, `jac-t9-cabina__luces-on` y `jac-t9-volante`. **Ámbar: 0,22 % @1x.**

### Qué cambió en la cabina (v1 → v2, según las fotos del T9 real)
- **Volante.** Antes era una dona genérica. Ahora tiene:
  - aro negro grueso con fondo achatado;
  - inserto en U plateado bajo el cubo;
  - placas plateadas en los rayos, con dos botones por lado;
  - marca plateada a las 12;
  - cubo trapezoidal redondeado con la **insignia JAC ovalada cromada**.
  
  Ahora es una pieza aparte.
- **Cuadro.** Va bajo una capota (binnacle) y tiene:
  - dos relojes de arco con marcas blancas segmentadas y marcas rojas al final;
  - pantalla central con el ícono del carro y la autonomía «319»;
  - un solo testigo ámbar.
- **Pantalla central vertical** con bisel cromado. Muestra:
  - un disco de música;
  - tres mosaicos: coral (navegación), morado (media) y verde (teléfono);
  - una fila de clima con dos puntos ámbar.
  
  Debajo lleva 6 botones plateados; el 4.º es el de emergencia, rojo con triángulo.
- **Rejillas con marco cromado:** una vertical alta junto a la pantalla y una a la izquierda.
- **Tablero:**
  - parte superior oscura con la rejilla del desempañador y un parlante a la izquierda;
  - banda de cuero con costura y filo plateado.
- **Techo** con una franja de techo solar (vidrio y cortina a medio correr).
- **Cabecera beige del copiloto** en el retrovisor, junto a la barra del platón.
- Palancas detrás del volante.
- Se mantienen los pilares A, el espejo lateral, las plumillas y la vista de la calle.
- **Nueva variante luces-off:** pantallas negras con un reflejo frío tenue y 0 % de ámbar.
- **Las pantallas usan luz fría.** El ámbar solo aparece en 3 testigos de 2×2 px; la cabina queda en 0,002 %.

## 3b. Frame C v3 · TERCERA PERSONA junto a la JAC T9 (BORRADOR · reemplaza al frame C en primera persona)

> **Implica un modo de cámara nuevo para Forge: tercera persona *over-the-shoulder*.** El sprite del jugador (Adonay de espaldas) va **fijo en pantalla, abajo al centro** (pies en (616, 705) @1x, capa 8, por encima de todo el mundo) y el mundo se proyecta desde una cámara **detrás y por encima de él** que lo sigue. Al caminar se anima `adonay-espalda__walk`; quieto, `__idle`. Los giros siguen siendo de 90°: la cámara rota con el jugador y él sigue de espaldas.

- **Archivo:** `frames/frame-c-a-pie-junto-t9@1x|@2x.png`. **Ámbar: 0,36 % @1x** (faroles y ventanas). Variantes de QA con los 4 frames de caminata: `src/_qa_frame-c3-walk0..3.png`.
- **Cámara (parámetros para Forge):**
  - alto **2,80 m**, **5,65 m** detrás de los pies de Adonay, nivelada (sin pitch), FOV horizontal 70° (f = 914 px @1x);
  - **horizonte en y = 252** mediante desplazamiento del eje óptico (*lens shift*): como la cámara no se inclina, las verticales siguen verticales y las fachadas siguen siendo billboards frontales con `scale = f/(z·16)`;
  - proyección: `x = 640 + (x − cam.x)·914/z ; y = 252 − (y − 2,80)·914/z` (z medido desde la cámara);
  - Adonay en x = −0,15 m, z = 5,649 m → mide **288 px** (1,78 m), cabeza en y = 417, pies en y = 705; con 2 px @1x por píxel de arte, la escala es entera;
  - **por qué 5,65 m y no 3–4 m:** con cámara nivelada a FOV 70°, a 3–4 m los pies salen del cuadro (solo se verían hombros y cabeza). Se priorizó el cuerpo entero, como en el modo escritorio del portfolio de Tom John. Si Forge prefiere 3,5 m, el sprite sirve igual y queda cortado a la altura de los muslos.
- **Composición:** Adonay camina por la acera (x −3,2…1,6). A su derecha están el brocal y la calle, y en el canal de estacionamiento la T9 en 3/4 frontal (nariz a z = 8,2 m, costado pasajero en x = 2,0 m). Al fondo, tras la calle transversal (z 38–46), Casa Volaris, Estudio 6×6, Casa Bain y Casa Mentoría (z = 50). A los lados, Casa P&G (z 36) y Casa Finoa (z 30). Hay 4 cujíes, un banco y 3 faroles; Ávila y cielo en tile.
- **Escala verificada:** techo de la T9 (1,84 m) en y = 359.0 sobre la nariz y suelo en y = 564.1; frente de 218.5 px de ancho (1,96 m). La T9 es 1,034× más alta que Adonay; las líneas de 1,78/1,84 m de la hoja lo comprueban.

### La T9 3/4 (`piezas/jac-t9-ext__34-frontal-3p__apagado`)
- **No está redibujada.** Son los píxeles del render v3 aprobado (`/workspace/jac3/se.jpg`, el mismo de `relleno/jac-t9/v3`). Se re-proyectan cara por cara (lado pasajero, frente, capó, parabrisas, techo y lona) con homografías exactas: el iso es afín, así que cada plano pasa exacto a la perspectiva de la cámara. Así se conservan las rampas de sombreado, los brillos, los contornos, la textura y los grises del v3. El mallado de caras está en `src/t9v3/modelo.py` y el re-proyector en `src/t9v3/reproj.py`.
- **Ajustes:** el magenta del fondo que se veía a través de los vidrios se neutralizó a vidrio oscuro con la misma luminancia; la pieza tiene borde binario (pixel-art nítido, 0 % de halo); en el frame se aplica un tinte nocturno multiplicativo (`0xCCD1E6` en Pixi), mientras que la pieza exportada conserva los colores del v3.
- **Sombra:** de contacto, suave (huella desenfocada, sin losa negra).
- **Uso válido:** 1:1 solo en esta pose cámara↔camioneta. A lo largo del mismo eje se puede escalar ≈ 8,2/z con un pequeño error de perspectiva. Para otras poses hay que volver a correr `reproj.render()` con la nueva cámara: es barato y determinista.
- Las piezas v1 `jac-t9-ext__lado|trasera|frente` (vectoriales planas, **rechazadas**) se movieron a `piezas/_obsoleto-t9ext-v1/` y salieron de `piezas.json`.

### Adonay de espaldas (`piezas/adonay-espalda*`)
- Pixel-art nuevo a resolución de arte 96×150 (el personaje ocupa 144 filas = 1,78 m), sin antialias, con la **paleta exacta** de `forge-paquete/personaje/adonay`. Se agregó una sola sombra de piel. Lleva pelo rizado oscuro (de espaldas solo asoman las patillas de la barba), sobrecamisa arena con canesú y tablón trasero, mangas remangadas, pulsera roja en la muñeca izquierda, culotte negro ancho y Converse mostaza de suela blanca.
- `@1x` = arte ×2 (192×300 por frame) y `@2x` = arte ×4, ambos NEAREST. Ancla: pies-centro (96, 296) → `anchor (0,5, 0,9867)`.
- `__idle`: 2 frames (respiración de 1 px). `__walk`: 4 frames (talón izquierdo arriba · paso · talón derecho arriba · paso), con braceo y rebote de 2 px; se recomiendan ~8 fps. `adonay-espalda` es el frame suelto.
- **Ámbar:** la regla del paquete marca ~16 % en el sprite suelto, pero es **ropa** (arena y mostaza del sprite aprobado), no luz. Con el tinte nocturno del frame deja de contar y el frame completo da 0,36 %.

## 4. QA hostil v2 (hoja `qa/primera-persona/paquete-v2.png`)

La hoja muestra:
- frame B encendido y apagado, frame A y la máscara de ámbar;
- la cabina on/off sobre damero;
- recortes @1x junto a ×3 (cuadro, pantalla vertical, insignia);
- el volante con su ancla y pruebas de giro de −90°, −30°, +30° y +90°;
- cada fachada junto a su iso;
- props, el Ávila con la costura marcada, los suelos y la tabla de ámbar y bordes.

Qué falló y se arregló:
1. **Halos de borde.** El `resize` de Pillow redondea el alfa premultiplicado a 8 bits y oscurecía de 3 a 4 niveles los píxeles con alfa 16 (5,6 % del borde del volante, 5,1 % del Ávila). Se cambió por un BOX propio en float. Ahora el halo es 0 % en las 44 imágenes @1x (42 piezas + 2 frames; el @2x es NEAREST del @1x). Se mide como el % de píxeles semitransparentes más oscuros que el píxel opaco más oscuro de su bloque de origen.
2. **Ávila casi invisible** contra el cielo. Se subieron la cresta y el filo un paso dentro del grafito; se sigue leyendo como lejano.
3. **Chimenea de P&G desproporcionada:** medía 13,4 m contra los ~9 m que sugiere el iso. Se bajó a 9,6 m.
4. **Reflejos de las pantallas apagadas y textos de los mosaicos.** Perdían el alfa: `ImageDraw` reemplaza el alfa en vez de mezclarlo. Ahora se componen en una capa aparte.
5. **Volante.** Los arcos decorativos cruzaban el fondo achatado. Se recortan con máscaras del aro.
6. **Recorte de la insignia** que no cabía en la hoja: ahora el bloque de zoom pasa a una segunda fila.

Resultado:
- ámbar ≤ 5 % en todas las imágenes; el máximo es la Flor encendida, con 3,90 %;
- todas las variantes apagadas tienen 0 %;
- transparencia limpia y sin halos.

### QA hostil del frame C v3 (hoja `qa/primera-persona/frame-c-t9.png`)
- **Ámbar:** frame C 0,36 %, T9 3/4 0 %. Adonay ~16 % por la ropa, no por luz (ver 3b).
- **Halos y transparencia:** T9 con 0 px de alfa parcial (borde binario), 0 % de halo y 0 px de magenta residual. Adonay con 0 px de alfa parcial (NEAREST).
- **Escala:** OK. Las líneas de 1,78 m en el plano de Adonay y en el de la T9, más la de 1,84 m del techo, cuadran; el horizonte cian marca 2,80 m.
- **¿Se lee como la JAC T9?** Sí: es el mismo render v3 (parrilla alta de panal con JAC, tira LED fina + bloque de faros bajo, nariz corta y redondeada, barras de techo, lona).
- **¿Se lee como Adonay?** Al lado de los idle del mapa, sí: pelo, sobrecamisa arena, culotte negro y Converse mostaza.
- **Arreglos durante el QA:**
  - el borde de la T9 daba 17,9 % de halo (franja oscura del key del render): se binarizó el alfa;
  - el parabrisas mostraba el magenta del fondo del render: se neutralizó;
  - la T9 brillaba como de día: se le aplicó el tinte nocturno en el frame;
  - un cují cercano tapaba el cielo: se alejó;
  - el cuello de Adonay estaba demasiado ancho: se angostó.

### QA de v1 (se mantiene)
1. La Catedral quedaba tapada por la Biblioteca. Se movió a la derecha (x 76).
2. Un farol cercano tapaba el flanco del Teresa y la torre de la Catedral. Se quitó y quedaron faroles a z ≥ 22.
3. Los árboles se dibujaban encima de edificios que estaban más cerca. Ahora hay un solo orden painter por z (en Pixi, `zIndex = −z`).
4. Los puntales traseros de la Biblioteca se veían como una escalera. Se quitaron y quedan solo los delanteros.
5. La fachada rayada de la Biblioteca parecía de ladrillo. Ahora tiene paneles largos con juntas claras, como en la foto, y acentos que no se solapan.
6. Las letras TALKS se montaban sobre las barras de luz y la pieza llegaba a 5,48 % de ámbar. Ahora las letras son más chicas, las barras quedan solo debajo y son tibias apagadas: 2,87 %.
7. Las alas de la Catedral se veían como una malla de alambre por la niebla. Ahora son sólidas con la cara inferior en sombra, y se quitó el filo tibio que se veía quebrado.
8. El capó no se leía y sus biseles parecían rayas de carril. Ahora tiene bandas planas, hombros con pliegue en sombra y un domo con la tapa clara y el bisel derecho oscuro. Se quitó una banda oscura delantera que quedaba mal y una mancha amarillenta.
9. El volante era un disco lleno que tapaba el cuadro. Ahora es una dona real y se ve el cuadro por el hueco.
10. Los halos y charcos eran degradados de aerógrafo. Ahora son 3 anillos duros con alfa baja.

## 5. Debilidades (honestas)

- **Frame C v3 (tercera persona):**
  - la T9 3/4 es una re-proyección 2D, no un modelo 3D: vale exacta solo para esta pose. El espejo del lado conductor no aparece y la barra antivuelco queda aplanada sobre la lona, porque no son caras planas del mallado; el costado sale muy escorzado porque la cámara está casi en su eje;
  - no hay variante con luces de la T9 3/4 todavía;
  - Adonay tiene 2 px por píxel de arte: un píxel más grueso que el fondo (1 px). Es coherente con sus sprites del mapa, no con la densidad del mundo. Los brazos son algo rígidos y el walk tiene 4 frames;
  - la cámara está a 5,65 m detrás, no a 3–4 m (ver 3b);
  - pintar a Adonay de espaldas fue interpretación: los sprites del mapa no tienen vista trasera pura, solo 3/4 de espaldas (NE/NW).
- **El volante es más chico y está más alto** que en la foto. Si fuera físico, a 1,45 m de ojo taparía medio parabrisas. Se escaló para que se lea el cuadro por el hueco. Su fondo achatado y la U inferior no se ven en el frame B, solo al girar.
- **La cabina es una interpretación.** Las proporciones del tablero y de la capota, y la posición de las rejillas, están ajustadas al FOV de 70°; no son una medida. La cabecera del copiloto va en el retrovisor porque no entra en el campo de visión hacia adelante.
- **Íconos de la pantalla vertical** reducidos a 3 mosaicos. A 1x se leen como «pantalla con apps», no como la interfaz real. Los textos son rayitas.
- **Insignia JAC.** A 1x mide unos 26×10 px y se lee por la forma ovalada cromada y las letras de 3×5. En ×2 se lee claro.
- **Las fachadas nuevas son alzados inventados desde el iso.** Las alturas son estimadas (ver abajo).
  - La Flor reduce los pétalos a abanico frontal.
  - El Sambil pierde la planta en «guitarra»: queda un cuerpo de 84 m con conos.
  - Finoa no tiene las cintas del iso en el frente (se ven en la cara lateral, que no hay).
  - El toldo rayado de P&G es una fila de lamas grises.
- **Alturas supuestas (m):**
  - Flor: tambor 6,6, farol del núcleo ~12, pétalos hasta 20,4.
  - Sambil: cuerpo 15, conos 26–31 más mástiles.
  - Estudio: muro 4,6, pretil 5,3, techo 5,9.
  - Volaris: bóveda ~9, torre 11,8.
  - Bain: 11,4 más cuarto de máquinas.
  - Mentoría: cumbrera 6,4.
  - Finoa: 8,6.
  - P&G: dientes ~7, chimenea 9,6.
  - Anchos: 16 px/m sobre el ancho de las celdas del iso (casas 12,6–13,6 m).
- **El Ávila es genérico.** Siluetas periódicas con la torre del Humboldt; no copia el perfil real.
- **Los frames están mejor que el runtime.** Sigue sin probarse en Pixi: no hay prueba de rendimiento ni de mipmaps/LOD, y el trazo crece al escalar de cerca.
- **El cruce solo existe como spec y como franjas.** Falta la lógica de qué franja va en cada z. Tampoco hay faroles ni semáforos de esquina.
- Sigue la mezcla geográfica: la Catedral de Barquisimeto aparece con el Ávila de fondo.

## 6. Catedral y Flor redibujadas desde fotos reales (v3 · BORRADOR · 17 oct 2026)

Las dos fachadas de v2 eran alzados inventados desde el iso. Ahora se dibujan mirando fotos reales. **Estado: BORRADOR.** Esta sección reemplaza, solo para estas dos piezas, los valores de ámbar de la tabla del §2 y las notas de la Flor del §5.

- **Piezas** (se sobrescribieron; mismos tamaños, anclas y metros que v2):
  - `piezas/fachada-catedral-de-barquisimeto__luz-encendida|apagada@1x|@2x.png`: 736×588 @1x, 46 × 36,6 m, ancla [368, 587]
  - `piezas/fachada-flor-de-venezuela__luz-encendida|apagada@1x|@2x.png`: 679×329 @1x, 42,4 × 20,4 m, ancla [339, 328]
- **Ámbar** (sobre píxeles con alfa > 20; entre paréntesis, sobre el lienzo entero):
  - Catedral: encendida 2,08 % (0,5 %), apagada 0 %
  - Flor: encendida 2,92 % (1,76 %), apagada 0 %
  - Halos: 0 % en las cuatro.
- **Frame A** se re-renderizó porque usa la Catedral. Solo cambia la zona de la Catedral; el Ávila se lee del tile ya exportado. Ámbar: 0,23 % (antes 0,26 %). El frame B no usa estas fachadas y no se tocó.
- **Código:**
  - `src/v3_catedral_flor.py` tiene el dibujo y `FUENTE_REF`.
  - `src/v2_piezas.py` conecta las dos funciones nuevas.
  - `src/build_catedral_flor.py` exporta solo estas 4 variantes y el frame A, y actualiza solo esas entradas de `ambar-v2.json` y `qa-v2.json`.
  - `src/hoja_catedral_flor.py` genera la hoja.
  - `gen_piezas_v2.py` copia `fuente_ref`. Ojo: si se vuelve a ejecutar, reescribe `piezas.json` entero.
- **Copia de lo anterior:** `_v2-previo/` (8 PNG de fachada, frame A, `piezas.json`, `README.md`, `ambar-v2.json`, `qa-v2.json`, `v2_piezas.py`, `gen_piezas_v2.py`).
- **Hoja de comparación:** `/workspace/portfolio/qa/primera-persona/catedral-flor-comparacion.png`. Muestra la foto real, la pieza encendida y apagada, la versión anterior, la máscara de ámbar, el borde ×4 y el frame A antes y después.

### Fuentes (solo referencia visual; ningún píxel de las fotos está en las piezas; copias en `refs/`, detalle en `refs/FUENTES.json`)

| Edificio | Uso | Foto (Wikimedia Commons) | Autor | Licencia |
|---|---|---|---|---|
| Catedral | alzado principal (frente simétrico) | https://commons.wikimedia.org/wiki/File:Catedral_Metropolitana_de_Barquisimeto.jpg | Jesús David Ríos (Flickr) | CC BY-SA 2.0 |
| Catedral | puntas de las alas y ancho relativo | https://commons.wikimedia.org/wiki/File:Catedral_de_Barquisimeto.jpg | reindertot | CC BY 2.0 |
| Catedral | campanario exento (confirmación; no se dibuja) | https://commons.wikimedia.org/wiki/File:Vista_de_la_Catedral_de_Barquisimeto_y_su_campanario.jpg | LoganPaelias | CC BY-SA 4.0 |
| Flor | alzado principal (pétalos abiertos) | https://commons.wikimedia.org/wiki/File:Flor_de_Venezuela_(Barquisimeto),_vista_frontal.jpg | Miguel Ahiezer Salcedo | CC BY-SA 3.0 |
| Flor | abanico de pétalos de frente, de noche | https://commons.wikimedia.org/wiki/File:Flor_de_venezuela_barquisimeto_lara_3.jpg | beachpow | CC BY-SA 4.0 |

Datos de escala de la Flor: Ø 38–39 m, 16 pétalos móviles y un mástil en celosía de unos 18 m (es.wikipedia «Pabellón de Venezuela en la Expo 2000», Informes de la Construcción/CSIC). Para la Catedral no hay alturas fiables publicadas (una web dice «82 m», lo que no cuadra con las fotos). Se midió en la foto tomando las puertas de unos 7 m, lo que da la cruz a unos 27 m.

### Qué se ve ahora
- **Catedral:**
  - torre-linterna en hiperboloide de concreto claro con perforaciones romboidales en tresbolillo (encendida: algunas brillan como linterna) y una cruz de doble travesaño sobre un mástil largo;
  - falda que abraza el pórtico, con la vidriera triangular de vidrio y acero debajo;
  - pórtico de arco rebajado con borde blanco grueso, 4 pilastras y puerta de cobre con sol tallado;
  - alas de cubierta de vidrio en paraboloide hiperbólico: bajan desde la torre y el alero sube hasta rematar en punta (la «silla» de la foto 2);
  - muros bajos con pilares blancos y vitrales.
- **Flor:**
  - abanico frontal de 8 pétalos convexos claros, 7 cóncavos más oscuros intercalados (las «tejas árabes» de Vivas) y el de enfrente, de canto, como triángulo con la punta hacia abajo;
  - tallo en celosía con capitel (encendido: luz en el capitel);
  - tambor de vidrio de dos niveles con balcón y focos;
  - jardineras escalonadas (tepuy), rampa curva a la izquierda y marquesina del acceso.

### Debilidades (honestas)
- **Catedral:** para respetar los 46 m del lienzo, las alas quedan **~9 % más angostas** que en la foto. La cruz llega a unos 27 m, así que quedan **unos 9 m de lienzo transparente arriba**. Se mantuvieron tamaño y ancla; no se recortó el lienzo.
- **Catedral:** **no se incluye el campanario exento.** Está a decenas de metros del templo y meterlo en este plano falsearía la distancia. Si hace falta, sería una pieza aparte.
- **Catedral:** las alas se leen oscuras de noche. En la foto de día el vidrio refleja el cielo y se ve claro. Los paños tibios de la cubierta encendida (DIM, no cuentan como ámbar) son una interpretación.
- **Flor:** los pétalos son un **abanico 2D medido en la foto, no una proyección 3D** (se probó el modelo 3D en ortogonal y se leía como cortina o paraguas). Se pierde la profundidad de los pétalos de atrás.
- **Flor:** las luces reales de la Flor son verdes y blancas. Aquí, por la regla del kit, la luz es solo ámbar y tibia oscura.
- **Flor:** el letrero VENEZUELA es un trazo ilegible a 1x. No hay bandera.
- **Flor:** la rampa y la marquesina están simplificadas.
- **Las dos:** las alturas salen de medir fotos en perspectiva, no de planos. Son aproximadas (±15 %).

### 6b. Flor rehecha (v3b · BORRADOR · 17 oct 2026)

Adonay **aprobó la Catedral**: no se toca. **Rechazó la Flor** porque los pétalos se leían como un abanico ancho y achatado, tipo domo o paraguas. Ahora:
- **Pétalos:** cada uno es una **hoja curva separada** que nace del capitel por un brazo de acero y se abre **hacia arriba y afuera** (corona de palma), con lomo arqueado, membrana festoneada y **punta aguda propia**. Los ángulos, el número y el largo se trazaron sobre la foto de día (Miguel Ahiezer Salcedo, CC BY-SA 3.0) y se contrastaron con la nocturna (beachpow, CC BY-SA 4.0).
- **`fachada-flor-de-venezuela`** (pieza normal; mismo lienzo 679×329, ancla [339, 328] y 42,4 × 20,4 m): 11 hojas visibles. Ámbar: encendida 3,0 %, apagada 0,0 %.
- **`fachada-flor-de-venezuela-profundidad`** (variante alternativa, mismo lienzo y ancla): 11 hojas delanteras + 5 traseras más oscuras y parcialmente tapadas, 16 en total como la real. Ámbar: encendida 2,82 %, apagada 0,0 %.
- **Halos:** 0 % en las 4 imágenes.
- **Frame A:** no incluye la Flor, así que no se re-renderizó.
- **Lienzo:** para caber en 20,4 m, la corona va **comprimida al 80 % en vertical** respecto de la foto de día, y el capitel baja de ~13,8 m a 12,9 m. Sin comprimir haría falta **679×369 @1x (22,9 m de alto, ancla [339, 368])**, o sea 40 px más. Vista previa (no es pieza): `qa/primera-persona/flor-v3-propuesta-lienzo-alto@1x.png`.
- **Código, copias y hoja:**
  - código: `src/v3b_flor.py` y `src/build_flor_v3.py` (exportan solo la Flor);
  - copia de lo anterior: `_v3-flor-previo/`;
  - hoja: `qa/primera-persona/flor-comparacion-v3.png`.
- **Debilidades:**
  - las raíces de las hojas se ven algo romas;
  - la hoja central de frente es una interpretación;
  - la luz real es verde y blanca; aquí es ámbar en el capitel y tibio oscuro bajo las hojas;
  - el letrero sigue ilegible y no hay bandera.
