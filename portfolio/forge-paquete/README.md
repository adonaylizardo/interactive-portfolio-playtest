# Paquete Forge · Portfolio interactivo (9 oct 2026 · bloques 1 y 2 del mapa exterior y bloque 3 de interiores y correcciones de los bloques 1 y 2: 11 oct 2026)

Salió del archivo de Figma **Portfolio interactivo Kit** (`D1Vq9b3rBzXquj0FjwSV2q`), tokens **Estudio noche**. Todo viene con fondo transparente.

## Carpetas

```
forge-paquete/
├─ README.md            este archivo
├─ indice.json          lista de assets → carpeta, nodo del set, cantidad de variantes
├─ tokens.ts            copia de /workspace/portfolio-kit/tokens.ts (colores, estados, kit)
├─ exteriores/          edificios por fuera: default · hover · resaltado × zoom cerca/lejos
│  ├─ flor-de-venezuela/        set 60:15 (versión oficial v2)
│  ├─ catedral-de-barquisimeto/ set 46:23
│  ├─ sambil-barquisimeto/      set 56:23
│  ├─ estudio/                  set 7:1002 (2×2, el de la columna · Mundo)
│  ├─ estudio-6x6/              set 119:198 (bloque 1: el Estudio a la huella del mapa)
│  └─ casas-caso/               set 128:2267 (bloque 2): volaris · bain · mentoria · finoa · pg, una carpeta por caso
├─ interiores/          estado=interior de los mismos sets (cerca = corte para ver adentro; lejos = misma silueta que el default lejos)
│  ├─ flor-de-venezuela/        60:235 (auditorio girado, opción B aprobada) + 60:304
│  ├─ catedral-de-barquisimeto/ 46:18 + 46:22
│  ├─ sambil-barquisimeto/      56:18 + 56:22
│  └─ casas-caso/               set interior/caso 141:910 (bloque 3): volaris · bain · mentoria · finoa · pg, salas 6×6 × zoom cerca/lejos
├─ muebles/             muebles compartidos, todas las variantes
│  ├─ grada/ (71:326, 20)  pasarela/ (71:325, 5)  banco/ (71:322, 20)  butaca/ (71:323, 4)
│  └─ baranda/ (71:324, 18)  mesa/ (71:186)  planta/ (71:193)  farol/ (71:198)
├─ tiles/suelo/         tile/suelo (1:6): borde=no (caminable sí y no) · se · sw · esquina-s
├─ tiles/calle/         tile/calle (113:124): recta · cruce · t · esquina · final (15)
├─ tiles/parque/        tile/parque (114:53): césped · sendero · bordes se/sw/esquina-s (7)
├─ relleno/             props de relleno del mapa (lote 1, 14 oct 2026, programático): ver la sección «Relleno · lote 1»
└─ paisaje/             props de paisaje sin interior
   ├─ muro-escalada/            paisaje/muro-escalada (95:941): vista=cerca · vista=lejos
   ├─ arbol/                    paisaje/arbol (115:73): redondo · cipres · araguaney × cerca/lejos
   ├─ banco-exterior/           paisaje/banco-exterior (118:55): izq · der × cerca/lejos
   ├─ farol-exterior/           paisaje/farol-exterior (118:94): izq · der × cerca/lejos
   ├─ obelisco/                 paisaje/obelisco (128:2315): vista=cerca · vista=lejos
   └─ redoma/                   paisaje/redoma (129:885): vista=cerca · vista=lejos
```

En cada carpeta hay un `manifest.json` con, para cada variante: nombre en Figma, id del nodo, archivos, tamaño, ancla y `offset_y`.

## Formatos

Cada variante viene en tres archivos:

- `.svg`: el export SVG de Figma, recortado al frame de la variante (viewBox `0 0 w h`). Es la fuente.
- `@1x.png`: tamaño real del juego.
- `@2x.png`: para pantallas densas.

Los PNG se rasterizan desde ese SVG con fondo transparente. Contra el render 1x de Figma, la diferencia es menor a 5/255 de promedio y ningún píxel se aleja más de 60/255.

## Nombres

`<asset>__<propiedad>-<valor>_<propiedad>-<valor>[@1x|@2x].<ext>`, en minúsculas y sin acentos. Las equivalencias:

- `—` → `na` (la propiedad no aplica);
- `+u` → `mas-u` y `−u` → `menos-u`;
- `sí` → `si`.

Ejemplos:

- `flor-de-venezuela__estado-hover_zoom-cerca@2x.png`
- `grada__forma-auditorio-lateral_r-na_h-na_fila-3_lado-der.svg`
- `tile-suelo__caminable-no_borde-esquina-s@1x.png`

Los muebles sin variantes (mesa, planta, farol) usan solo el nombre del asset: `mesa@1x.png`.

## Anclas y offset

Las medidas van en px @1x. Para @2x, multiplica todo por 2.

**Cómo colocar un asset:** sea `S` el punto del mundo en pantalla. Dibuja el frame con la esquina superior izquierda en `(S.x − ancla.x, S.y − ancla.y − offset_y)`.

| Tipo | Frame | Ancla | offset_y | S = |
|---|---|---|---|---|
| Flor de Venezuela | 512×384 | (256, 384) centro inferior | 0 | vértice frontal de la huella 4×4 |
| Catedral | 640×576 | (320, 576) centro inferior | 0 | vértice frontal de la huella 5×5 |
| Sambil | 768×448 | (384, 448) centro inferior | 0 | ver nota* |
| tile/suelo borde=no | 128×64 | (64, 64) | 0 | vértice inferior del rombo |
| tile/suelo borde=se/sw/esquina-s | 128×88 | (64, 88) | −24 | vértice inferior del rombo |
| muebles | variable | el punto de piso de cada variante | 0 | punto del piso donde va el mueble |
| paisaje/muro-escalada | 320×224 | (160, 224) centro inferior | 0 | ver nota** |
| Estudio 6×6 | 768×520 | (384, 520) centro inferior | 0 | vértice frontal de la huella 6×6 = vértice inferior de la casilla (33, 35) |
| tile/calle, tile/parque borde=no | 128×64 | (64, 64) | 0 | vértice inferior del rombo |
| tile/parque borde=se/sw/esquina-s | 128×88 | (64, 88) | −24 | vértice inferior del rombo |
| paisaje/arbol | 128×208 | (64, 208) | 0 | vértice inferior del rombo de su casilla |
| paisaje/banco-exterior | 128×96 | (64, 96) | 0 | vértice inferior del rombo de su casilla |
| paisaje/farol-exterior | 128×152 | (64, 152) | 0 | vértice inferior del rombo de su casilla |

\* **Sambil:** la huella 8×4 es asimétrica. El vértice frontal del suelo cae en (512, 448), es decir +128 px en x respecto del ancla. Viene en el manifest como `vertice_frontal_suelo`.

\*\* **Muro de escalada:** la huella 3×2 también es asimétrica. El vértice frontal del suelo cae en (192, 224), +32 px en x respecto del ancla (viene como `vertice_frontal_suelo`). S = vértice inferior del rombo de la casilla (37, 41) corrido 32 px a la izquierda.

**Tiles de borde:** el rombo de arriba está en la misma posición que en un tile normal; la losa cuelga 24 px más abajo. Por eso el ancla (64, 88) queda 24 px por debajo del vértice del rombo, y eso es lo que indica `offset_y = −24`.

En el mapa 64×64 los bordes van así:

- `x = 63` → `borde=se`;
- `y = 63` → `borde=sw`;
- `(63, 63)` → `borde=esquina-s`;
- el resto de las casillas → `borde=no`.

Los bordes son siempre `caminable=no` y no llevan trazo punteado. En `x = 0` e `y = 0` no va ningún tile: el mapa termina contra el fondo y el código bloquea en el límite (regla de Beast, 2026-10-09). La vista previa en `/workspace/portfolio/mapa/orilla/` todavía muestra esas filas punteadas; ignóralas.

Dibuja los tiles en orden de profundidad, de menor a mayor `x + y`, y los edificios después del suelo.

**Muebles:** las gradas, pasarelas y barandas ya vienen dentro de los PNG de los interiores. Aquí van sueltas por si quieres reusarlas. En las gradas de auditorio el ancla es el centro del tambor a nivel del foso, por eso cae fuera del frame (hay valores negativos).

## Paisaje · muro de escalada

Es el muro de escalada de la casa como prop de paisaje: no tiene interior ni estados de hover. Set `paisaje/muro-escalada` (nodo 95:941), con una sola propiedad, `vista`:

- `vista=cerca` (95:877): tablas con juntas, presas, volumen inclinado en la esquina, puerta, 2 vigas, cuerda y el bombillo del ventilador con su halo. Los nombres ADO y NOAH se leen en la fila del muro principal a media altura, y JOYS en el muro de la puerta.
- `vista=lejos` (95:913): mismo muro sin juntas ni letras, con un salpicado de presas más grandes y un solo punto de luz. Úsalo con el mismo umbral que el `zoom=lejos` de los edificios.

Archivos: `muro-escalada__vista-cerca.svg`, `muro-escalada__vista-cerca@1x.png`, `muro-escalada__vista-cerca@2x.png` (y lo mismo con `vista-lejos`).

**Dónde va:** casillas x 35–37, y 40–41 del mapa (x del mapa = largo del muro principal, 3 casillas; y = 2 casillas). El acceso es desde (38, 41), por el lado abierto. Si la casilla (x, y) tiene su vértice superior en `O + ((x − y)·64, (x + y)·32)`, la esquina superior izquierda del frame queda en `O + (−448, 2336)`. Es lo mismo que aplicar la fórmula general con S = centro inferior de la huella. En @2x multiplica por 2.

**Profundidad:** dibújalo después del suelo. Para ordenarlo contra el jugador, usa la fila frontal (x + y = 78). Las paredes están solo al fondo (−y) y a la izquierda (−x), así que el jugador puede pararse adentro sin que lo tapen.

Colores: tablas en `world/wood`. El muro está lleno de presas, como el real: en `vista=cerca` hay 94 en el muro principal, 33 en el muro de la puerta (alrededor de JOYS y del marco, nunca sobre la puerta) y 17 en el volumen, a toda altura; en `vista=lejos` hay 43, 13 y 5. Cada letra tiene ~2,5 px libres alrededor para que el campo denso no se la coma. Las presas normales usan `world/hold` (#424244, en `tokens.ts` como `world.hold`) en las dos vistas, también las del volumen: jugs, gotas, regletas, volumencitos, romos y un par de aros. Cada una lleva una sombra de 1 px abajo en `world/tile-side`. Los nombres van en `world/prop-line`, un escalón más claro y con la misma sombra: ADO y NOAH en el muro principal, y JOYS en el muro de la puerta, entre la puerta y el borde frontal, a la misma altura (solo en `vista=cerca`).

Ámbar: 0,02 % en cerca y 0,03 % en lejos (solo el bombillo).

## Bloque 1 · mapa exterior (11 oct 2026)

Todo vive en la página nueva **03 · Mapa exterior** de Figma (`111:15`). La viñeta de prueba es el frame `121:15`.

- **tile/calle** (`tiles/calle/`): calle de 1 casilla con asfalto, veredas, cordón y marca de carril tenue (sin ámbar). La propiedad `abre` lista los lados por donde sigue la calle, siempre en el orden ne · se · sw · nw (ne = −y, se = +x, sw = +y, nw = −x). Para elegir la pieza, mira qué vecinos son calle: 2 opuestos → `recta`, 2 contiguos → `esquina`, 3 → `t`, 4 → `cruce` y 1 → `final`. Siempre es caminable=sí.
- **tile/parque** (`tiles/parque/`): césped continuo, sin línea de grilla, más dos senderos rectos. En la orilla usa la misma regla que tile/suelo: `x = 63` → `borde=se`, `y = 63` → `borde=sw` y `(63, 63)` → `borde=esquina-s`.
- **paisaje/arbol, banco-exterior, farol-exterior**: props de 1×1 que se colocan como un tile, con S = vértice inferior del rombo de su casilla. El tronco, el banco y el poste quedan en el centro de la casilla, a 32 px por encima del ancla. `izq` mira o apunta a +y y `der` a +x. Para alumbrar una calle, pon el farol en la casilla del lado −x o −y. El manifest del farol trae `luz`, por si quieres sumar un brillo en código.
- **Estudio 6×6** (`exteriores/estudio-6x6/`): es un set nuevo, `edificio/estudio-6x6`. El 2×2 no se tocó. Va en las casillas x 28–33, y 30–35. La puerta queda en la cara +y, sobre la casilla x = 31, y su centro cae justo en el lado de la casilla de acceso (31, 36). Atajo: la esquina superior izquierda del frame va en `O + (−512, 1720)`. Para la profundidad, usa la fila frontal (x + y = 68). Los estados son los del 2×2: exterior · hover · resaltado × cerca/lejos.
- **Tokens nuevos** en `tokens.ts` y en Figma: `world/grass` (#171C18, césped y copas) y `world/bloom` (#6A6248, solo la flor del araguaney; retirado en las correcciones, ver abajo).
- **Costuras:** el césped, la vereda, el asfalto y el sendero llevan un trazo de 1 px de su mismo color. Así, al pegar tiles no se ve el fondo entre casillas (se probó sobre magenta: 0 px). Los lados cerrados de la calle llevan la línea de grilla de tile/suelo.
- **Ámbar medido** sobre el área opaca de los PNG @1x: 0 % en calle, parque, árboles y bancos. El farol cerca tiene 1,7 % de ámbar puro y ~4,4 % contando el halo; el farol lejos, 2,2 %. El Estudio 6×6 exterior cerca tiene 0,03 % de ámbar puro y 3,4 % contando las ventanas encendidas al 55 %; hover, 4,2 %; resaltado, 4,8 %.
- QA en `/workspace/portfolio/qa/bloque1/`.

## Bloque 2 · casas de caso y paisaje (11 oct 2026)

Todo está en la página **03 · Mapa exterior** (`111:15`): `edificio/caso` (`128:2267`), `paisaje/obelisco` (`128:2315`) y `paisaje/redoma` (`129:885`).

- **Casas de caso** (`exteriores/casas-caso/<caso>/`, una carpeta y un manifest por caso: volaris, bain, mentoria, finoa, pg). Todas salen del mismo set `edificio/caso` (caso × estado exterior/hover/resaltado × zoom cerca/lejos) y del mismo módulo base: huella 3×3, frame 384×352, ancla (192, 352) = vértice frontal de la huella, offset_y 0. El sistema de puerta (0,48 casilla, luz, marquesina y escalón) va centrado en la casilla del medio de la cara de la puerta. Cada casa suma un rasgo propio hecho con arquitectura, sin logos: Volaris = hangar con bóveda + torre de control; Bain = torre de oficinas con muro cortina en grilla; Mentoría = taller con techo a dos aguas, pizarra con un wireframe y porche con bancos; Finoa = bóveda berlinesa con puerta redonda de caja fuerte; P&G = nave con diente de sierra, chimenea y frente de tienda.
- **Puertas en +x** (finoa, pg): es el mismo módulo reflejado (x ↔ y del mapa), pero la luz no se refleja: lo que mira a +y sigue en `world/prop-face` y lo que mira a +x en `world/tile-side`. No tienes que espejar nada en código; cada caso ya viene orientado.
- **Colocación:** S = vértice inferior del rombo de la casilla (x0 + 2, y0 + 2). Con el vértice superior de la casilla (x, y) en `O + ((x − y)·64, (x + y)·32)`, la esquina superior izquierda del frame va en `O + ((x0 − y0)·64 − 192, (x0 + y0)·32 − 160)`. Cada manifest trae su atajo, `puerta` (centro inferior de la puerta en el frame), `luces` y `punto_lejos`. En Mentoría la puerta está 0,5 casilla adentro, detrás del porche, así que el manifest suma `llegada` (el borde del porche que toca la casilla de acceso). Se verificó que puerta/llegada caen justo en el lado de la casilla de acceso en los 5 casos.
- **Obelisco** (`paisaje/obelisco/`): losa de base rectangular sin ahusar, con reloj, mirador y el arco de concreto en la cara trasera (−x; asoma a la izquierda), sobre la redoma verde. Es lo más alto del mapa (396 px). Frame 384×528, ancla (192, 528). La cara ancha mira a +x, hacia el acceso (17, 36).
- **Redoma del Sol** (`paisaje/redoma/`): isla 3×3 con los 32 paneles en radio de Cruz-Diez y un "sol" de luz mínima en el centro. Frame 384×224, ancla (192, 224). El anillo de calle (x 44–48, y 34–38) lo armas tú con `tiles/calle`; el borde de la isla lleva un trazo del mismo color del césped, sin costura (se probó sobre magenta: 0 px).
- **Ámbar** sobre el área opaca de los PNG @1x: exterior cerca entre 0,5 % (Finoa) y 1,5 % (Mentoría y P&G), por debajo del Estudio (3,4 %), que sigue siendo el más cálido. Hover llega hasta 3,2 % y resaltado hasta 4,95 % (P&G). Por eso en las casas el resaltado usa un contorno de 1,5 px y un brillo de 4 px al 25 %. Obelisco y redoma: menos de 0,3 %.
- **Corrección del bloque 1:** los atajos de colocación del bloque 1 usaban otro origen. Ya quedaron con la misma convención del muro (`O` = vértice superior de la casilla): Estudio 6×6 en `O + (−512, 1720)`, tiles en `O + ((x − y)·64 − 64, (x + y)·32)` y paisaje 1×1 en `O + ((x − y)·64 − 64, (x + y)·32 + 64 − h)`. La fórmula general con S y ancla no cambió.
- QA en `/workspace/portfolio/qa/bloque2/`.

## Bloque 3 · interiores de las casas de caso (11 oct 2026)

Todo está en la página **03 · Mapa exterior** (`111:15`), en un set nuevo: `interior/caso` (`141:910`, caso × zoom cerca/lejos, 10 variantes). No se tocó `edificio/caso` (`128:2267`): sumarle un estado `interior` cambiaba un set ya aprobado y mezclaba huellas de 3×3 con salas de 6×6. Un set aparte es lo más seguro para publicar.

- **Sala:** 6×6 casillas, igual que `InteriorDef` del build (salida (3, 5), spawn (3, 4)). Corte de casa de muñecas: los dos muros del fondo miden 140 px (como el Estudio) y los del frente son zócalos de 14 px. El vano de la puerta está en la cara +y, en la casilla (3, 5), con jambas de 24 px, un umbral encendido y el **tapete de salida**: rombo claro (`world/prop-line`) con dos franjas de madera. Es lo más claro del piso, así se encuentra la salida aun al 25 %.
- **Frame 800×604, ancla (400, 604), offset_y −24.** La losa cuelga 24 px bajo el frente, como `tile/suelo` borde, así que `vertice_frontal_suelo` = (400, 580). El vértice inferior de la celda (x, y) cae en `(400 + (x − y)·64, 260 + (x + y)·32)` del frame. Si dibujas el piso con `tileFootWorld`, pon el frame en (−400, −228) del origen del cuarto.
- **Pieza principal** en la esquina del fondo (cerca de 2× el personaje de 64×96): Volaris = cola de avión de exhibición; Bain = pizarra de pared con una matriz 2×2; Mentoría = caballete con un wireframe; Finoa = portal con la puerta redonda de la bóveda; P&G = estantería de producción. La cola, la bóveda y la estantería pasan por arriba de los muros del fondo a propósito.
- **Muebles del kit:** banco, butaca, mesa, planta y farol (`71:17`) van como instancias agrandadas ×2,5 a ×4, con el trazo devuelto a 1 px. Grada, pasarela y baranda no se usaron: son de los hitos y no calzan en salas de 6×6. Lo nuevo (mostradores, mesa de reuniones, escritorios seguros, casilleros, estantería, cinta) usa la misma regla de caras del kit: tapa `prop-face`, derecha `tile-top` e izquierda `tile-side`.
- **Manifest:** además de lo de siempre trae `puerta` (cara, celda de salida y spawn), `tapete_salida`, `pieza_principal` (bbox y alto), `muebles_kit`, `luces` y `punto_lejos`. También trae `mascara_caminable`, un extra porque los interiores anteriores no la tenían: 6 filas, `#` = mueble, sacadas de las huellas horneadas. Ojo: el build hoy bloquea todo el anillo del borde, y la máscara no lo hace.
- **Los muebles vienen horneados** en el frame y el personaje se dibuja encima. No hay capa de primer plano. Si quieres que el personaje pase por detrás de la cola, la estantería o el portal, avísame y saco esas piezas a una capa aparte.
- **zoom=lejos:** piso, muro izquierdo `prop-face`, muro derecho `tile-side`, canto `tile-line` (3 tonos), silueta de la pieza principal en `tile-line`, tapete en `prop-line` y un solo punto ámbar en la puerta.
- **Ámbar** (área opaca de los PNG @1x): cerca entre 0,5 % (Finoa) y 2,2 % (Mentoría); lejos, 0,01 %.
- QA en `/workspace/portfolio/qa/bloque3/`.

## Bloques 1 y 2 · correcciones de Pixel (11 oct 2026)

Mismos nodos, mismos nombres de archivo y mismo formato: solo cambió el dibujo. Cada manifest corregido trae un campo `correcciones` y su entrada en `indice.json` dice `corregido`.

- **Lejos en tonos.** Todas las variantes `lejos` (casas, Estudio 6×6, Obelisco, Redoma, árboles, banco y farol) dejan la silueta plana y usan tres tonos del cerca: techo y tapas `world/tile-line`, cara que mira a +y `world/prop-face`, cara que mira a +x y huecos `world/tile-side`. Sin cantos; cada relleno lleva un trazo de 1 px del mismo color para que no salgan costuras. La Redoma va en dos tonos (sus paneles no tienen tapa) y los árboles también (luz arriba-izquierda, sombra abajo-derecha). En hover lejos, el contorno `ui/text` 2 px es una capa aparte encima.
- **Araguaney en gris.** La copa pasó de `world/bloom` a `world/prop-face` con canto `world/prop-line`, y las flores a `world/tile-line`. `world/bloom` quedó sin uso: lo **retiré** (oculto de la publicación, con nota en su descripción), no lo borré.
- **Puertas.** Finoa y P&G tienen ahora la puerta del Estudio: 0,56 casilla × 74 px, con luz, legible sin hover. En Finoa la bóveda redonda deja de ser la puerta: pasa a la cara +y, sin ámbar, y la entrada es rectangular en la cara +x (muro de 84 a 96 px). En P&G el muro sube de 66 a 90 px y el toldo queda encima de la puerta. Cada manifest de casa trae `puerta.verificacion`: la cara de la puerta coincide con el acceso de `mapa_datos.json` en las 5 casas.
- **Techos un paso más claros.** Techo y tapas de `world/tile-top` a `world/prop-face`, pretil a `world/tile-line` (casas y Estudio 6×6). La calle no cambió: se separa del césped por la vereda y el cordón. Al 25 % la separación la dan las variantes lejos (techo `world/tile-line`: 1,6:1 contra el césped).
- **Obelisco.** El manifest trae `colision`: la franja sólida es x = 15, y 35–37 (plinto y losa); las otras 6 casillas de la plaza son decorativas.
- **Obelisco, 12 oct (foto de Adonay).** El frente es la cara +x, la que mira al acceso (17, 36): ahí van las ranuras del mirador, el reloj, la placa, la puerta y una escalinata recta entre muros inclinados que baja hasta (16, 36). La escalinata bloquea: la colisión queda en x 15, y 35–37 + (16, 36). Con la foto trasera volvió el arco, solo como apoyo y sin peldaños, en la cara angosta +y; su pie cae en (15, 37). El reloj trasero y la inscripción 1552 · 1952 van en −x (tapados en esta vista).

## Relleno · lote 1: naturaleza y props de calle (14 oct 2026 · borrador, sin publicar)

Carpeta nueva `relleno/`, una subcarpeta por asset. **No sale de Figma**: lo genera por código `/workspace/portfolio/qa/relleno/generar_lote1.py` y los manifests salen de `manifests.py`. En el manifest, `nodo` va en `null` y `origen.tipo` dice `programatico`. El `.svg` es la fuente y los PNG @1x/@2x se sacan de él.

```
relleno/
├─ cuji/                 vista cerca/lejos                     huella 1×1, 128×208
├─ araguaney-florecido/  vista cerca/lejos                     1×1, 128×208
├─ cardon/               vista cerca/lejos                     1×1, 128×208
├─ fuente/               vista cerca/lejos                     2×2, 256×208
├─ banco-con-gente/      quien (senor-cafecito, mujer-tote) × orientacion izq/der × vista   1×1, 128×176
├─ bicis-estacionadas/   orientacion × vista                   1×1, 128×128
├─ parada-bus/           orientacion × vista                   2×1 (izq) o 1×2 (der), 192×240
├─ carrito-cachapas/     orientacion × vista                   1×1, 128×232
├─ puesto-jugos/         orientacion × vista                   1×1, 128×240
└─ carrito-cepillados/   orientacion × vista                   1×1, 128×224
```

- **Escala.** Va a escala del personaje @2x (96 px) sobre tiles de 128×64: 1 m de alto = 52 px @1x y 1 m en el eje = (40, 20) px. Un mostrador llega a la cintura de Adonay y el asiento del banco a su rodilla. `banco-exterior` (59 px) **no se redibuja**: Forge confirmó que sirve con el personaje @2x.
- **Cómo colocarlo.** Igual que el resto: dibuja el frame en `(S.x − ancla.x, S.y − ancla.y − offset_y)`. Aquí `ancla = vertice_frontal_suelo` y `offset_y = 0`, y **S = vértice inferior de la casilla frontal** de la huella, la de x e y máximos. Para la casilla (x, y), con vértice superior en `O + ((x − y)·64, (x + y)·32)`, S = `O + ((x − y)·64, (x + y)·32 + 64)`. Ordena la profundidad por x + y de esa casilla. Cada manifest trae además `huella` y `centro_huella`.
- **Orientación.** `izq` = el frente (mostrador, asiento) mira a +y; `der` = mira a +x. Pon el frente hacia el camino.
- **Gente horneada.** La gente del banco y quienes atienden los puestos vienen horneados en los PNG. Son los sprites pixel de `personaje/npcs` a su tamaño de mapa (@2x dentro del PNG @1x), compuestos con NEAREST para que no se emborronen. La cola de las cachapas no va horneada: pon 3 NPC en `idle_ne` donde dice `plan-relleno.md`.
- **Lejos.** Tres tonos, sin cantos ni texto, la gente en silueta `world/prop-face` y como mucho un punto ámbar.
- **Ámbar** (solo el arte vectorial, área opaca @1x): parada 1,0 %, carritos y kiosco entre 0,1 y 0,15 %, fuente 0,08 %, árboles, banco y bicis 0 %. Los NPC tienen piel y ropa cálidas que el contador marca como "ámbar" (el banco con el señor de camisa roja da 20 %), pero no son `world/glow`.
- **Araguaney.** No usa `world/bloom`, que está retirado: la flor va en `prop-line`/`tile-line`, más densa que en `paisaje/arbol`.
- **Dónde va cada cosa:** `/workspace/portfolio/mapa/plan-relleno.md`. QA en `/workspace/portfolio/qa/relleno/`.

## Relleno · lote 2 (14 oct 2026 · borrador, sin publicar)

Todo está en `relleno/`, con su propio **`relleno/README.md`**: escala, colocación, tabla de assets y reglas.

- **Lote 2A:**
  - `mural-logo`, con capas opcionales para los guiños.
  - `palomas`, `gatos` y `camionetica`: sprites pixel con tiras @1x/@2x y fps en el manifest. En el mapa usa el @2x, igual que personaje/.
  - `farol-noche`: el farol del kit en estado apagado/encendido, con animación de encendido y un sprite de brillo aparte.
- **Lote 2B:** `cafe-fachada` y `disqueria-fachada` (fachadas de 2 casillas sin interior), `cancha-basket` (3×5) y `parque-perros` (4×4).
- **Correcciones del lote 1:**
  - Los carritos de cachapas y jugos reemplazan a los árboles FILLER (27, 38) y (34, 38).
  - Se quitó banco-1, porque ya hay banco en (29, 40).
  - Las bicis pasan a (36, 37).
  - `paisaje/banco-exterior` no cambia.
- **Árboles:** el estilo de cují, araguaney y cardón está en revisión; hay 3 estudios en `qa/relleno/arboles-estilos.png`.

## Relleno · lote 3 y árboles estilo C (14 oct 2026 · borrador, sin publicar)

- **`rincon-meditacion`:** un cojín (zafu sobre un tapete, con plantita y vela) en (26,32), al costado oeste del Estudio. Si interactúas, Adonay se sienta y pasa a la anim `adonay__meditar_{se|sw}` (personaje/).
- **`mirador`:** deck 3×3 en x 51–53, y 35–37, con 3 telescopios en (51,35), (52,35) y (53,35). El de (52,35) tiene una persona mirando por el ocular. La cola usa NPCs idle en (52,36), (52,37), (52,38) y (53,38). De noche se suma el overlay `mirador-cielo`, con estrellas que titilan.
- **Árboles:** `cuji`, `araguaney-florecido` y `cardon` ahora usan el estilo C (natural detallado). Mantienen el mismo id, frame y ancla. El cardón se redibujó a 117 px visibles (1,22× Adonay). El araguaney sigue en la paleta aprobada; el amarillo apagado (bloom) va aparte, en la variante `flor=bloom-pendiente`, hasta que Adonay lo apruebe.
- **Ajustes:** mural con Volaris y Bain activos (`capa=completa`) y camionetica con franja lateral clara.
- **Logo del mural (PROVISIONAL):** `relleno/mural/logo-vector.svg`, vectorizado con potrace desde el PNG de adonaylizardo.com, con aprobación de Adonay. El mural ahora lo dibuja en vector y se ve nítido a 2x. Cámbialo por el SVG oficial cuando llegue.
- **`golf`:** el green 4×4 va en x 48–51, y 46–49, con el hoyo 7 en (49,48) y el bunker en (51,49). El golfista NPC está en (51,47) y hace un putt de 6 frames; la bola cae al hoyo. El tapete de práctica (opcional) va en x 53, y 46–47. La luz ámbar sale solo de la copa y del cartel.
- **`jac-t9` (DRAFT, pausado):** pickup JAC T9 v2 Graphite Grey, redibujada desde las fotos de Adonay. Esperando su OK antes de ponerla en el mapa. Vehículo controlable: idle, andar, faros, freno, intermitentes L/R y glow nocturno. Huella 3×2 en x 25–27, y 17–18. Celda 160×100, ancla (80,88). 116 px @2x (1,21× Adonay).
- **Grok Bots (aprobados, v3):** `relleno/bots/`. Forge (34,31) se ↔ The Architect (35,30) sw, y TARS (34,34) se ↔ Jean "Claude" Van Damme (35,33) sw. Loop de trabajo de 4 frames a 4 fps, 64–68 px @2x.

## Reglas del kit que conviene respetar

- El ámbar (`world/glow`, #FFB547) es solo luz y no pasa del 5 % por variante. El interior de la Flor anda en 1,4 %.
- `zoom=lejos` se usa por debajo de ~0,4 de escala (`kit.zoomLejosBelow` en `tokens.ts`). Forge decide el umbral final.
- No escales el arte dentro del PNG: escala en código (rombo 2:1 de 128×64).
