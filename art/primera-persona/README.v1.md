# Primera persona · propuesta (BORRADOR · 17 oct 2026)

**Estado: BORRADOR.** Es una propuesta de técnica con piezas mínimas y dos frames de muestra. No se activó nada, no se tocó `indice.json` y no cambió el estado de ningún otro asset. Forge pidió proponer primero, así que esto no es el set completo.

- Frames: `frames/frame-a-a-pie@1x.png` / `@2x` y `frames/frame-b-jac-t9@1x.png` / `@2x`
- Piezas: `piezas/` (lista completa en `piezas.json`)
- Código: `src/build_primera_persona.py` (frames + piezas + ámbar) y `src/hoja_qa.py`
- Hoja de QA: `/workspace/portfolio/qa/primera-persona/propuesta.png`

## 1. Técnica recomendada

**Planos de fachada frontales + calle pseudo-3D, en PixiJS v8 y sin motor 3D.**

| Capa | Qué es | Cómo se dibuja en Pixi |
|---|---|---|
| 0 cielo | tile 2048×400 (degradado y estrellas) | `TilingSprite` fijo. Solo se desplaza en x con el giro |
| 1 cerros (El Ávila) | silueta lejana | `TilingSprite`. No se mueve al caminar |
| 2 suelo | avenida, aceras, cruce, plaza | `Graphics` con polígonos del plano y=0 proyectados en cada frame (son unas 30 caras). Las franjas `suelo-avenida` a/b se alternan cada 3 m de z y dan el efecto OutRun de velocidad |
| 3 fachadas | un plano frontal por edificio | `Sprite` con ancla centro-inferior, `scale = f/(z·16)`, `zIndex = −z` y un tinte de niebla según z |
| 4 props | farol, banco, árbol | Billboards por distancia, igual que las fachadas. Los halos van aparte en modo `add` |
| 5–6 overlays | capó + cabina del JAC T9 | Sprites fijos a la cámara (solo en modo carro) |

**Por qué funciona.** Un plano paralelo a la imagen se proyecta sin deformarse: solo cambian la escala y la posición. Por eso una fachada que mira a la cámara queda geométricamente exacta como sprite escalado, aunque esté a un lado. Basta con dos fórmulas:

```
x_pantalla = 640 + (x − cam.x) · f / z
y_pantalla = 360 − (y − ojo) · f / z        (f = 914 px @1x → FOV horizontal 70°, horizonte = ojo)
```

El suelo usa la misma proyección: para cada fila y > 360, z = f·ojo/(y−360). En la hoja de QA, los postes de 1,78 m (a pie) y 1,45 m (JAC) tocan el horizonte justo, y todas las fugas llegan al PF (640, 360).

**Restricción que lo mantiene honesto.** La cámara mira por los ejes de la grilla del mapa (N/E/S/O) y gira en saltos de 90° con una transición corta (barrido o fundido de unos 250 ms), como en un dungeon crawler. Encaja con un mapa isométrico que ya tiene 4 direcciones. Al caminar se avanza en z y se desliza en x. Para disimular se puede añadir un balanceo de ±3° (desplazar las capas en x según su z) sin romper la ilusión. Cada edificio necesita como mucho una fachada por cada calle desde la que se ve.

**Por qué conviene:**
- Reusa la tubería actual (PIL con supersampling ×4 → LANCZOS), la paleta y el trazo de 1 px. El arte sigue siendo 2D y se dibuja en código.
- En Pixi cuesta muy poco: unos 10 a 30 sprites, un `Graphics` y 2 overlays. No necesita depth buffer ni shaders propios.
- El agente de código ya tiene `Container`, `zIndex` y `sortableChildren`. Agregar el modo es una escena nueva.

**Opción intermedia, si después piden más libertad.** Pixi v8 trae `PerspectiveMesh` (a partir de 8.1). Con él, la misma textura de una fachada se puede pegar como pared lateral en escorzo, al estilo Wolfenstein. Así aparecerían los costados de la calle sin un motor 3D. Queda fuera del alcance mínimo.

**Alternativa descartada por ahora: Three.js low-poly.** A favor: giro libre, volúmenes reales y luces de verdad. En contra:
- Habría que remodelar en 3D cada edificio. El arte isométrico y frontal no se reusa.
- Para lograr el look pixel hace falta un render target de baja resolución, una cuantización a la paleta y un control del ámbar por post-proceso.
- Suma unos 150 KB gz de `three`, más un segundo contexto WebGL o la integración con Pixi.
- Cuesta más en móvil y deja dos motores que mantener.

Conviene solo si el giro libre se vuelve un requisito. Mientras tanto, los planos más el suelo proyectado dan el 90 % de la sensación por el 10 % del costo.

## 2. Piezas mínimas (referencia: viewport 1280×720 @1x, horizonte y=360)

Densidad de fachadas: **16 px/m @1x, 32 px/m @2x**. Ancla: **centro-inferior** (eje de la fachada sobre la línea de suelo = última fila).

| Pieza | Tamaño @1x | @2x | Ancla / uso | Variantes | ¿Hecha? | Ámbar |
|---|---|---|---|---|---|---|
| cielo-noche (tile) | 2048×400 | 4096×800 | fila 360 = horizonte; envuelve en x | — | sí | 0 % |
| cerros-avila (tile) | 2048×80 | 4096×160 | borde inferior en y=362 | — | no (va en código en los frames) | 0 % |
| suelo-avenida fase a / b | 512×8 | 1024×16 | x=256 = eje; 16 px = 1 m (−16…+16 m) | a, b | sí | 0 % |
| suelo-cruce-y-plaza | 512×8 | 1024×16 | ídem | — | no (va en código) | — |
| fachada-teresa-carreno (Talks) | 1040×614 | 2080×1228 | (608, 613) | luz encendida / apagada | sí | 2,87 % / 0 % |
| fachada-biblioteca-ingenieria (Writings) | 468×185 | 936×370 | (234, 184) | luz encendida / apagada | sí | 1,81 % / 0,03 % |
| fachada-catedral-de-barquisimeto | 736×588 | 1472×1176 | (368, 587) | luz encendida / apagada | sí | 1,76 % / 0 % |
| fachada-flor-de-venezuela | ~704×256 (estim.) | ×2 | centro-inferior | encendida / apagada | no | — |
| fachada-sambil-barquisimeto | ~1440×288 (estim.) | ×2 | centro-inferior | encendida / apagada | no | — |
| fachada-estudio-6x6 | ~288×144 (estim.) | ×2 | centro-inferior | encendida / apagada | no | — |
| fachada-casa-{volaris, bain, mentoria, finoa, pg} | ~192×128 c/u (estim.) | ×2 | centro-inferior | encendida / apagada | no | — |
| farol-frente (del kit, de frente) | 24×76 | 48×152 | (6, 75) pie del poste; espejar con scale.x=−1 | encendido | sí | 2,67 % |
| farol-frente-halo | — | — | capa `add` | — | no (va en código) | — |
| banco-frente, arbol-frente | — | — | billboard | — | no (marcadores en los frames) | — |
| jac-t9-capo (overlay) | 1280×720 | 2560×1440 | (0,0) del viewport; caja útil x 80–1280, y 439–628 | — | sí | 0 % |
| jac-t9-cabina (overlay) | 1280×720 | 2560×1440 | (0,0) del viewport; parabrisas y hueco del volante transparentes | luces-on (falta luces-off) | sí | 0,01 % |
| jac-t9-volante suelto | — | — | para rotar al doblar | — | no | — |

Los exteriores del índice son 9 edificios más el Teresa Carreño y la Biblioteca: flor-de-venezuela, catedral, sambil, estudio (2×2 y 6×6) y las 5 casas de caso. Las de arriba marcadas «no» son las fachadas que faltan. Sus medidas son estimadas y las fija Forge.

## 3. Frames de muestra

- **(a) A pie.** Ojo a 1,78 m, en la acera derecha (x=7,2 m). Se ve la avenida que remata en una calle transversal y, enfrente, la Biblioteca UCV (x −21, z 62), el Teresa Carreño (x 14, z 128) y la Catedral (x 76, z 150). Faroles a z 22 y 38, bancos. **Ámbar: 0,25 % @1x (0,26 % @2x).**
- **(b) JAC T9.** Ojo a 1,45 m, en el carril derecho y en el puesto izquierdo (0,37 m del eje del carro). La calle es la misma. Se ven el capó Graphite Grey (hombros, domo central, filo delantero), las plumillas, los pilares A, los vidrios laterales tintados con el espejo izquierdo y el tablero con costura de madera charcoal. El cuadro tiene luz fría y un solo testigo ámbar, la pantalla central muestra el mapa con un punto ámbar, el volante lleva la insignia **JAC** (solo texto, es la única marca) y el retrovisor muestra la ventana trasera con **la barra del platón** y las cabeceras. **Ámbar: 0,23 % @1x (0,26 % @2x).**

El ámbar se mide con la regla de relleno/edificios: r>90, r−b>55, g>b, r≥g sobre píxeles opacos. Tope: 5 %.

## 4. QA hostil: qué falló y se arregló

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

- **Sin volumen.** Solo hay caras frontales. De cerca y de lado, el edificio parece un decorado de teatro: las bóvedas no tienen fondo y las terrazas octogonales del Teresa se ven planas. Mitigación: giros de 90°, edificios a 40 m o más, o `PerspectiveMesh` para los costados.
- **Los frames están mejor que el runtime.** Aquí cada fachada se dibuja en vector a su escala exacta y con un trazo de 1 px fijo. En Pixi serán bitmaps escalados: de lejos se ablandan (hacen falta mipmaps o un LOD a 8 px/m) y de cerca se ven gruesos, con un trazo que crece. Falta probarlo en Pixi. No hay prueba de rendimiento ni de movimiento.
- **Las composiciones frontales son interpretaciones.** El alzado del Teresa se armó con las piezas del isométrico (terrazas, torre TALKS, flanco trapezoidal): el edificio real no es un solo plano. La Catedral está simplificada: las alas no son los paraboloides reales.
- **Mezcla geográfica.** La Catedral de Barquisimeto aparece con El Ávila de fondo. Si molesta, se cambia por la Flor de Venezuela cuando exista su fachada.
- **La cabina del T9 es genérica.** En `personaje-refs/jac-t9/` no hay fotos del interior. El tablero, el cuadro y la pantalla son aproximados. El capó sale de las fotos del exterior. Los vidrios laterales muestran la misma proyección, que no es física fuera de los pilares A.
- **Faros casi invisibles.** El capó tapa el haz de los faros. Además se hicieron en blanco neutro, no ámbar, para no gastar el presupuesto: los LED del T9 son blancos.
- **Ámbar en el límite de la regla.** Las ventanas tibias grandes usan tonos (74,58,38) y (84,66,42), que la regla no cuenta como ámbar pero se ven cálidos. El número es bajo por eso. Visualmente, el calor de la escena es algo mayor que 0,25 %.
- **Marcadores, no arte final.** El árbol, el banco y la niebla (tinte por capa) son marcadores.
- **Escala abierta.** Falta decidir cuántos metros mide una casilla del mapa en primera persona. Aquí se usan metros casi reales y los edificios del mapa están comprimidos.
