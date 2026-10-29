# Biblioteca de la Facultad de Ingeniería UCV · edificio **Writings** (APROBADO v3)

Aquí van los artículos de Adonay. Es la biblioteca de Villanueva en la Ciudad Universitaria de Caracas, hecha con el mismo pipeline que el Teatro Teresa Carreño v2b: paleta del kit (`tokens.ts`) y ámbar `world/glow` solo como luz. **Es de UNA sola planta.**

**Estado:** APROBADO. `colocacion.activa=false`, no está aprobada para el mapa y no está en `mapa_datos.json`.

## Geometría (@1x; multiplica por 2 para @2x)
- Huella **10×8** tiles. Las bóvedas van en x 1..9, y 1..7; los puntales llegan casi al borde en ±y.
- Frame 608×438 @1x (1216×876 @2x), igual para exterior e interior.
- Ancla = centro inferior del frame, en (304, 438). Ojo: el vértice frontal del suelo cae en (336, 438), +32 px en x respecto del ancla. Vértice trasero (272, 150); esquinas laterales (16, 278) y (592, 310).
- Para colocarla, usa la regla de colocación que está en `manifest.json`.

## Exterior (v3)
- **Dos bóvedas gemelas de cáscara delgada** (arranque 48 px, clave 120 px), ahora con volumen: degradado por pendiente (faldón trasero claro, frontal en sombra), brillo de cresta, nervios transversales sobre la curva, valle oscuro entre las bóvedas y borde claro más grueso.
- **Puntales** con canto superior claro, cara lateral en sombra, línea de luz y zapata en el suelo.
- **Ventanal del testero: UN solo vidrio alto** con degradado cálido continuo (abajo) a frío (arriba), solo parteluces verticales y siluetas de estanterías abajo. Ya no hay dos bandas encendidas: no se lee como dos pisos. Las ventanas bajas del costado también usan degradado sin travesaño.
- Fachada con paneles oscuros y acentos Villanueva apagados; puerta en la cara +y (x 5..6); grama, lajas, arbustos y 3 `muebles/farol`.
- Ámbar medido sobre el área opaca @1x: encendida 0,03 %, apagada 0,03 %, hover 0,03 %, resaltado 1,65 %, lejos 0,10 %.

## Interior caminable (v3)
Corte sin techo y sin muros frontales. Sin entrepiso ni escalera (se quitaron en v2).
- **Muro de artículos premium** en el testero x=1: marco de madera grueso, paspartú, pantalla con degradado, 5 apliques con haz cálido tenue y repisa al pie.
  - Rect principal (lista de Pixel), máscara `biblioteca-ingenieria-interior__mascara-articulos@1x/@2x.png`. Esquinas @1x: tl (93.44, 231.92) · tr (259.84, 148.72) · br (259.84, 182.72) · bl (93.44, 265.92). Bbox 93.44, 148.72, 166.4×117.2. `p(u,v) = tl + u·(166.4, −83.2) + v·(0, 34)`.
  - **Lunetas** dentro de los dos arcos (cabeceras/títulos), máscara aparte `…__mascara-articulos-lunetas@1x/@2x.png`; polígonos en `manifest.json` → `muro_articulos.lunetas`.
- **Mobiliario:** estantería con lomos (y=1), sofá central, 4 butacas tapizadas (2 mirando al muro, 2 en el rincón de lectura), 2 mesas de lectura con lámparas, mesita con lámpara, 3 alfombras, 3 plantas de hojas, 7 lámparas con charcos de luz cálida.

**Grilla** (un nivel, z=0; x 1..8, filas y 1..6). A = pasillo, E = entrada/spawn, B = estantería, T = mesa, F = sofá, C = butaca, L = mesita con lámpara, P = planta.

```
y1  ABBBBBBB
y2  AAAAACLC
y3  AAAAAAAA
y4  ACTAFATA
y5  ACTAFATA
y6  PAAAEAAP
```
- **Entrada y spawn:** casilla (5,6), misma puerta del exterior, mira al nw.
- Pasillos ≥1 casilla (128 px @2x; Adonay 96 px). BFS: las 28 casillas caminables están conectadas con la entrada. Las alfombras son caminables.
- Ámbar medido: 0,05 % (cerca), 0,10 % (lejos).

## Fuente
- `/workspace/portfolio/qa/edificios/biblioteca-ingenieria-src/build_biblioteca.py`; hoja de QA con `hoja_qa.py` → `qa/edificios/biblioteca-ingenieria-propuesta.png` (la máscara ya no tapa a la gente).
- Referencias: `personaje-refs/biblioteca-ingenieria-ucv/refs.md`.

## Debilidades conocidas
- No hay SVG ni nodo de Figma.
- #787C84 (borde y parteluces) y los acentos naranja/amarillo apagados no son tokens del kit; se mantienen a propósito.
- Las bóvedas ganaron volumen pero siguen siendo oscuras de noche; el borde trasero se ve como un arco fino.
- Los haces de los apliques son triángulos geométricos; las lunetas son planas.
- Las butacas y la mesita son cajas simples; la butaca del kit no se usa (es de 16 px y queda de juguete).
- La planta delantera izquierda pisa un poco el muñón del muro.
- Los sprites de interior no tienen hover ni resaltado.
