// Portfolio interactivo — tokens "Estudio con look Campus de noche"
// Fuente: Chroma, /workspace/portfolio-stylescapes/tokens-estudio-noche.json (2026-10-08)
// Reglas del kit: Beast, Figma D1Vq9b3rBzXquj0FjwSV2q, página "00 · Reglas del kit"

export const color = {
  ui: {
    bg: "#0B0C0E",
    surface: "#141518",
    line: "#2A2C31",
    textSecondary: "#8A8F98",
    text: "#EDEEF0",
    accent: "#FFB547", // solo: paso actual, anillo del contador, foco
  },
  world: {
    tileTop: "#1A1C20",
    tileSide: "#121316",
    tileLine: "#3A3D44",
    propFace: "#24262B",
    propLine: "#5A5E66",
    glow: "#FFB547", // luz (ventanas, lámpara, puerta), nunca relleno grande
    wood: "#2A2521", // madera charcoal apenas cálida: tapas de bancos, gradas, escenario, pasarela
    water: "#11161A", // agua charcoal apenas fría: solo el estanque del interior del Sambil
    hold: "#424244", // world/hold: solo presas normales del muro de escalada (entre wood y prop-line)
    grass: "#171C18", // world/grass: césped y copas de árbol del mapa exterior (charcoal apenas verde)
  },
} as const;

// Estados del kit mapeados a tokens (nombres = tipo/nombre/estado en Figma)
export const state = {
  tile: {
    caminableSi: { fill: color.world.tileTop, line: color.world.tileLine },
    caminableNo: { fill: color.world.tileSide, line: color.world.tileLine, dash: [6, 4] },
  },
  prop: {
    // cara superior = propFace, derecha = tileTop, izquierda = tileSide
    default: { face: color.world.propFace, line: color.world.propLine },
    hover: { face: color.world.propFace, line: color.ui.text, lineWidth: 2 },
    resaltado: { face: color.world.propFace, line: color.world.propLine, glow: color.world.glow },
  },
  lejos: {
    // zoom=lejos (~25%): silueta plana + un solo punto de luz ámbar
    default: { fill: color.world.propFace, lightDot: color.world.glow },
    hover: { fill: color.world.propLine, lightDot: color.world.glow },
  },
  ui: {
    focusRing: color.ui.accent,
    progressRingTrack: color.ui.line,
    progressRingFill: color.ui.accent,
    stepCurrent: color.ui.accent,
    stepDone: color.ui.text,
    stepTodo: color.ui.textSecondary,
  },
} as const;

export const type = {
  display: { family: "'Inter Tight', sans-serif", weight: 600, tracking: "-0.035em" },
  body: { family: "'Inter', sans-serif", weights: [400, 500] },
  mono: { family: "'Geist Mono', monospace", weight: 500 }, // etiquetas, contador, metadatos de caso
} as const;

export const kit = {
  tile: { w: 128, h: 64 }, // rombo 2:1, escalar en código, nunca en el arte
  anchor: "bottom-center", // del frame completo exportado (PNG @1x y @2x, sin recortar)
  zoomLejosBelow: 0.25, // tope: además solo en el último ×2 de alejamiento (ver isLejosZoom)
  // Cámaras del minimapa (Figma ui/minimapa vista=…).
  // isometrica = default 2:1 iso. cenital = true overhead (roofs + upright billboards).
  // perspectiva = low follow cam (Pixi 3D projector, textured boxes, camera-relative WASD).
  cameras: ["isometrica", "cenital", "perspectiva", "persona"],
} as const;

export type Camera = (typeof kit.cameras)[number];

// Aviso de logro (Figma ui/aviso-logro). Duración y posición las decide Forge.
export const toast = {
  bg: color.ui.surface,
  line: color.ui.line, // borde 1px
  radius: 12,
  padding: [12, 16], // [vertical, horizontal]
  gap: 12,
  shadow: "0 1px 2px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.45)", // ui/shadow
  width: { desktop: 320, telefono: 343 },
  enter: { offsetY: 8, opacity: 0 }, // estado=entrando → visible
  durationMs: 3000, // sugerido
  position: { desktop: "top-center", telefono: "top-below-bar" },
} as const;

export const subtitle = {
  bg: "rgba(0, 0, 0, 0.65)", // ui/scrim
  text: color.ui.text,
  radius: 8,
  padding: [8, 12], // [vertical, horizontal]
  fontSize: { desktop: 15, telefono: 14 },
  lineHeight: 20,
  width: { desktop: 560, telefono: 343 }, // ancho fijo, alto crece
  align: "center",
} as const;

// Nota fija junto al botón de sonido: solo la primera vez que se activa el sonido.
export const soundNote = {
  bg: color.ui.surface,
  line: color.ui.line,
  text: color.ui.textSecondary,
  radius: 12,
  padding: [8, 12],
  gap: 8,
  fontSize: 13,
  lineHeight: 16,
  width: { desktop: 280, telefono: 240 },
  shadow: toast.shadow,
} as const;

export const tokens = { color, state, type, kit, toast, subtitle, soundNote } as const;
export default tokens;
