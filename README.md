# interactive-portfolio-playtest

Prototipo de interacción (bloques grises) para un futuro portafolio isométrico. Sin arte final ni contenido real.

**Live:** [https://adonaylizardo.github.io/interactive-portfolio-playtest/](https://adonaylizardo.github.io/interactive-portfolio-playtest/)
**Candidate preview:** [https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/](https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/)

## Desarrollo local

```bash
npm install
npm run dev
```

Build de producción (misma base que GitHub Pages):

```bash
npm run build
npm run preview
```

Abre la URL que muestra `preview` (incluye el prefijo `/interactive-portfolio-playtest/`).

## Editar el mapa

El mundo se define en **`src/data/map.ts`**:

- **`MAP_WIDTH` / `MAP_HEIGHT`**: tamaño de la cuadrícula (tiles).
- **`cells`**: matriz `walkable` y tipo de suelo (`groundId`, p. ej. `tile/grass/default`).
- **`objects`**: lista de props y edificios con convención `tipo/nombre/estado` en el campo `id` (p. ej. `building/caso-1/default`, `prop/escritorio/default`).
- Cada objeto usa **`x`, `y`** en tiles, anclado **bottom-center**.
- **`walkable: false`** + **`w` / `h`** marcan tiles bloqueados (el script también bloquea el footprint).
- Edificios: **`door: { x, y }`** (tile de puerta, caminable) y **`panelTitle`** para el panel lateral.

Después de cambiar el mapa, recarga la app; no hace falta tocar el renderer salvo que agregues tipos de prop nuevos (ver `src/game/scene.ts` → `refreshObjectVisuals`).

## Stack

- Vite + TypeScript
- PixiJS v8 (canvas isométrico)
- UI en DOM/CSS (checklist, panel de edificio)

## Checklist y estado

El progreso del tutorial se guarda en `localStorage` (`playtest-checklist-v3`). En **touch** son **4 pasos** (0/4→4/4): caminar (toca; doble toque para correr), cámara, zoom, edificio — sin paso de teclado. En **escritorio**, **5 pasos** incluyen WASD/flechas. En móvil la checklist llega **cerrada** (anillo + contador abajo); toca el anillo para abrir. La cámara (pan + zoom) se sincroniza con el hash de la URL (`#view=x=…&y=…&z=…`).

## GitHub Pages: preview vs live

Candidates never go to the live root. They publish under `/preview/` on the `gh-pages` branch.

| | URL |
|---|---|
| Live | https://adonaylizardo.github.io/interactive-portfolio-playtest/ |
| Preview | https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/ |

```bash
# after CI is green — updates /preview/ only
DEPLOY_GATE_PASSED=1 npm run deploy:preview
```

Promote to live only after explicit QA approval:

```bash
DEPLOY_TARGET=live DEPLOY_LIVE_APPROVED=1 DEPLOY_GATE_PASSED=1 npm run deploy:live
```

`npm run deploy:gh-pages` is the same as `deploy:preview`. Without `DEPLOY_LIVE_APPROVED=1`, a live deploy exits without touching the root.
