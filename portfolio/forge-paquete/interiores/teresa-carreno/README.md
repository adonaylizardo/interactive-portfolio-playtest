# Teatro Teresa Carreño · edificio **Talks** v2b (APROBADO)

Aquí van las charlas, entrevistas y video podcasts de Adonay. Es el Teatro Teresa Carreño de Caracas, en clave **Estudio noche**. El ámbar `world/glow` se usa solo como luz.

**Estado:** APROBADO por Adonay el 2026-10-16 ("listo este"). `colocacion.activa=false` hasta que Forge confirme con él la casilla y lo meta en `mapa_datos.json`.

## Geometría (@1x; multiplica por 2 para @2x)
- Huella **10×7** tiles (128×64 @2x). Ocupa 70 casillas contra las 32 del Sambil (8×4). Frame 576×462 @1x (1152×924 @2x), igual para exterior e interior.
- Ancla = centro inferior del frame, en (288, 462). Ojo: el vértice frontal del suelo cae en (336, 462), +48 px en x respecto del ancla. Vértice trasero (240, 190); esquinas laterales (16, 302) y (560, 350).
- Para colocarlo, usa la regla de los demás manifests (está en `manifest.json`).

## Exterior
- **Paleta del kit** (`tokens.ts`), igual que Catedral y Sambil: techo `prop-face`, cara +x `tile-top`, cara +y `tile-side`, contorno `prop-line`. La propuesta de hormigón claro se descartó.
- **Cuerpo trasero integrado:** va del borde de las terrazas al flanco. Su cara +y coincide con la trasera de la torre y su techo queda al nivel del flanco (176 px), así que forma un solo volumen; la torre sobresale por encima (198 px).
- **Tres losas octogonales escalonadas en voladizo**. Cada una tiene faja gruesa, bisel inclinado visible abajo con **banda cálida en el sofito**, pretil en la azotea, núcleo vidriado con pisos encendidos y columnas.
- **Flanco piramidal** de la Ríos Reyna con 22 nervaduras horizontales (sombra más canto claro), caja técnica arriba y anexo bajo con ventanas corridas y escalinata.
- **Torre** con franja de vidrio oscuro: **TALKS** arriba en letras 5×7 ámbar y pisos encendidos abajo.
- **Plaza** con despiece de losas, jardines con arbustos y palmas, rampas y 5 `muebles/farol` del kit.
- **Zoom lejos:** tres tonos con las nervaduras del flanco, los pretiles de las losas y un solo punto ámbar en la torre.
- Ámbar medido sobre el área opaca @1x: encendida 0,99 %, apagada 0,04 %, hover 0,99 %, resaltado 1,75 %, lejos 0,07 %.

## Interior caminable
Sala Ríos Reyna en corte: se quitan el techo y los dos muros frontales, que quedan como muñones bajos.

**Grilla** (columna = x 0..9, fila = y 0..6). S = escenario, s = escalones, A = pasillo, R = alfombra roja, B = butacas, M = bloqueado.

```
y0  MSAAAAAAAA
y1  SSABBBABBB
y2  SSABBBABBB
y3  SsRRRRRRRR
y4  SSABBBABBB
y5  SMABBBABBB
y6  MSAAAAAAAA
```

- Pasillos de 1 casilla entera (128 px @2x), así que Adonay (96 px de alto @2x) cabe holgado:
  - pasillo central rojo en y=3;
  - pasillos laterales en y=0 y y=6;
  - pasillo transversal en x=6;
  - franja frente al escenario en x=2.
- Escalones al escenario en (1,3); el podio está en (1,5).
- **Entrada y spawn:** casilla (8,6), por el vano del muñón frontal (borde +y).
- La platea sube por columnas: z = 0, 4, 8, 12, 16 (transversal), 21, 26, 31, 36 px @1x. El escenario está a z=10.
- El manifest trae la lista de casillas caminables y bloqueadas, la altura por columna y el centro en pantalla de cada casilla.

**Pantalla** para video en el muro x=0. La máscara está en `teresa-carreno-interior__mascara-pantalla@1x/@2x.png`.
- Esquinas @1x: tl (59.52, 173.36) · tr (206.72, 99.76) · br (206.72, 171.76) · bl (59.52, 245.36). En @2x son el doble.
- Para componer el video usa la transformación afín `p(u,v) = tl + u·(tr−tl) + v·(bl−tl)`.

Lo demás:
- Butacas: `muebles/butaca` mira=−u, el mueble compartido sin recolorear; van 4 por casilla B.
- Escenario de madera, boiserie, paneles acústicos y balcón lateral.
- Franja de paneles flotantes con spots junto al muro trasero.
- Ámbar medido: 0,06 %.

## Fuente
- Lo genera `/workspace/portfolio/qa/edificios/teresa-carreno-src/build_teresa_v2.py`. La v1 queda en `build_teresa_v1.py` y la v2a (hormigón claro) en `build_teresa_v2a_hormigon.py`.
- La hoja de QA sale de `hoja_qa.py` y queda en `qa/edificios/teresa-carreno-propuesta.png`.
- Las referencias están en `personaje-refs/teresa-carreno/refs.md`.

## Debilidades conocidas
- No hay SVG ni nodo de Figma, porque es programático.
- En grafito, los tres volúmenes se separan solo por el contorno y el tono de cada cara; contra el fondo oscuro del mapa se leen menos que en la foto.
- Las losas son octógonos regulares; las reales son más irregulares y alargadas. La escala sigue siendo simbólica.
- Las letras de TALKS son pixeladas dentro de un kit vectorial.
- El interior es rectangular (la sala real es en abanico) y el cielo raso es parcial.
- Las butacas del kit se ven chicas y repetitivas. Los muñones frontales escalonados se ven algo toscos.
- La grilla es de casilla entera: no modela los peldaños de 4 a 5 px entre filas. Para caminar fluido, Forge tiene que interpolar la altura.
