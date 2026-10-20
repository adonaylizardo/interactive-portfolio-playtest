# Interactive Portfolio

Adonay Lizardo’s explorable isometric portfolio — walk or drive a Caracas-inspired map and open landmarks for case studies, talks, writings, and achievements.

**Live:** [https://adonaylizardo.github.io/interactive-portfolio-playtest/](https://adonaylizardo.github.io/interactive-portfolio-playtest/)

## What it is

This is an interactive portfolio built as a tile-based isometric world in the browser. You move on foot or in the JAC T9 pickup, enter buildings to read work, and use the site chrome for search, about, and language — without leaving the experience.

- Explorable map with enterable buildings (case studies, talks, writings, achievements)
- Reading view without the map (`#/leer` and deep links such as `#/leer/estudio`)
- Site-wide search (cases, articles, talks, achievements, landmarks, about, contact)
- About panel with biography and contact
- English / Spanish toggle (EN / ES)
- Camera modes: isometric, top-down, third-person on foot, map overview; first-person-style driving view in the JAC with rear camera
- Building interiors, onboarding checklist, and URL hash for camera position and interiors
- Desktop split/map/panel layouts and a mobile sheet UI

## Tech stack

- **PixiJS v8** — isometric map rendering (canvas)
- **Vite 7** — dev server and production build
- **TypeScript** — application code
- **DOM / CSS** — chrome, panels, reading view, and accessibility
- **Playwright** — headless QA and deploy gates

## Getting started

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
npm run typecheck
```

`npm run build` runs `tsc && vite build`. `npm run preview` serves the production build locally (base path `/interactive-portfolio-playtest/`).

Optional preview builds for GitHub Pages subpaths:

```bash
npm run build:preview-edificios
npm run build:preview-contenido
```

There is no `test` script in `package.json`; use the [quality checks](#quality-checks) below.

## Project structure

| Path | Purpose |
|------|---------|
| `src/` | Game loop, map data, Pixi scene, UI chrome, i18n, and panels |
| `public/` | Sprites, logos, CV PDF, audio, and other static assets |
| `content/` | Case and content source material used by the app |
| `portfolio/` | Design references, UI specs, and forge/build inputs |
| `scripts/` | QA, verification, compression, and GitHub Pages deploy helpers |
| `docs/` | Project notes and references |
| `.github/workflows/` | CI gate, walk suite, and Pages deploy |

## Deploy

**Production (site root).** Pushes to `main` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): the shared **gate** workflow (`build`, `typecheck`, logo/case checks, `qa:sprites`, `qa:smoke`), then `npm run build`, then GitHub Actions **deploy-pages** publishes `dist` to the public URL above.

**Candidate previews (gh-pages branch).** Day-to-day candidates are published under subpaths on the `gh-pages` branch without replacing the live root:

| Subpath | Typical use |
|---------|-------------|
| `/interactive-portfolio-playtest/preview/` | General candidate (`npm run deploy:preview`) |
| `/interactive-portfolio-playtest/preview-edificios/` | Teatro / Biblioteca building work (`build:preview-edificios`, `DEPLOY_TARGET=preview-edificios`) |
| `/interactive-portfolio-playtest/preview-contenido/` | Content and reading view (`build:preview-contenido`, `deploy:preview-contenido`) |

Preview deploys build with a matching `--base` path, copy `dist` into the named folder on `gh-pages`, and leave the live root unchanged. Promoting to the root requires explicit approval (`DEPLOY_TARGET=live` with `DEPLOY_LIVE_APPROVED=1` in `scripts/deploy-gh-pages.mjs`).

## Quality checks

| Script | What it does |
|--------|----------------|
| `npm run qa` | Build, then full legacy QA runner (`scripts/qa.mjs`) |
| `npm run qa:gate` | Build, typecheck, logo/case checks, sprites gate, and smoke tests (deploy gate) |
| `npm run qa:sprites` | Sprite placement, picking, pixel diff, and interior shots |
| `npm run qa:smoke` | Fast real-input smoke (first load, doors, exits, input, camera, logos, NPCs, cases) |
| `npm run qa:pinch` | Long regression suite (pinch, input, screenshots; non-blocking in CI) |
| `npm run check:logos` | Validate “Worked with” logo assets |
| `npm run check:cases` | Grep public case copy for draft markers and leaks |
| `npm run verify:jac-drive` | Playwright check for JAC T9 drive UI states |
| `npm run verify:edificios` | Build preview-edificios and verify Teatro/Biblioteca flows |
| `npm run compress:sprites` | Generate WebP siblings for PNG sprites |

CI on `cursor/**` branches runs the gate via `verify.yml`; `walk-suite.yml` runs `qa:pinch` as informational only.

## Credits

Designed and built by [Adonay Lizardo](https://linkedin.com/in/adonaylizardo).

Contact: [adolizardo@gmail.com](mailto:adolizardo@gmail.com)
