# interactive-portfolio-playtest

Prototipo de interacción (bloques grises) para un futuro portafolio isométrico. Sin arte final ni contenido real.

**Vista previa en producción:** [https://adonaylizardo.github.io/interactive-portfolio-playtest/](https://adonaylizardo.github.io/interactive-portfolio-playtest/)

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

El progreso del tutorial se guarda en `localStorage` (`playtest-checklist-v2`). En **touch**, el paso 2 es **Corre** (doble toque); en **escritorio**, **Camina con las teclas** (WASD). La cámara (pan + zoom) se sincroniza con el hash de la URL (`#view=x=…&y=…&z=…`).

## Vista previa en rama `gh-pages` (sin merge a main)

```bash
npm run deploy:gh-pages
```

Publica `dist/` en la rama huérfana `gh-pages` (con `.nojekyll`) para apuntar GitHub Pages ahí mientras tanto.
