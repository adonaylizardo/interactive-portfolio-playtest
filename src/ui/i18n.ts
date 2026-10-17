export type Lang = 'en' | 'es';

const DICT = {
  en: {
    'check.label': 'Getting started',
    'check.walkAround': 'Walk around the world',
    'check.walkAround.desk': 'Click a tile to go there. Double-click or hold Shift to run.',
    'check.walkAround.touch': 'Tap a tile to go there. Double-tap a tile to run.',
    'check.walkKeys': 'Walk with the keys',
    'check.walkKeys.desk':
      'Use WASD or the arrow keys to move. Walk to a door (or press Enter next to it) to go in.',
    'check.walkKeys.touch': 'Use WASD or the arrow keys to move the character.',
    'check.moveCamera': 'Move the camera',
    'check.moveCamera.desk': 'Drag with the mouse or swipe with two fingers on the trackpad to pan.',
    'check.moveCamera.touch': 'Pinch with two fingers to pan and zoom. Recenter returns to Adonay.',
    'check.zoom': 'Zoom in and out',
    'check.zoom.desk': 'Pinch on the trackpad, or use Ctrl / ⌘ + mouse wheel.',
    'check.zoom.touch': 'Pinch with two fingers to zoom in or out.',
    'check.enterBuilding': 'Enter a building',
    'check.enterBuilding.desk': 'Click a building to walk to its door and open the panel.',
    'check.enterBuilding.touch': 'Tap a building to walk to its door and open the panel.',
    'check.skip': 'Skip tutorial',
    'check.close': 'Close',
    'check.done': 'Done!',
    'check.toggle': 'Open or close the step list',

    'toast.unreachable': "Can't get there",
    'toast.getOutToEnter': 'Get out to enter',

    'jac.hint': 'Use arrows or WASD',
    'jac.desc': 'JAC T9, the family pickup.',
    'jac.getIn': 'Get in',
    'jac.getOut': 'Get out',
    'jac.info': 'Info',
    'jac.close': 'Close',
    'jac.length': 'Length',
    'jac.lights': 'Lights',
    'jac.engine': 'Engine',
    'jac.gear': 'Gear',
    'jac.auto': 'Auto',
    'jac.off': 'Off',
    'jac.on': 'On',
    'jac.drive': 'Drive',
    'jac.hazards': 'Hazards',

    'canvas.label': 'Isometric playtest world',

    'panel.exit': 'Exit',
    'panel.close': 'Close',
    'panel.readCase': 'Read case',

    'chrome.cases': 'Cases',
    'chrome.achievements': 'Achievements',
    'chrome.contact': 'Contact',
    'chrome.search': 'Search',
    'chrome.downloadCv': 'Download CV',
    'chrome.sound': 'Sound',
    'chrome.fullPage': 'Full page',
    'chrome.title': 'Design lead working with AI.',
    'chrome.titleShort': 'Design lead working with AI',
    'chrome.who': 'Who are you?',
    'chrome.mentorship': 'Mentorship',
    'chrome.client': 'Client',
    'chrome.experience': 'Experience',
    'chrome.seeAll': 'See all',
    'chrome.mentorshipStat': 'Mentorship: 30+ people',
    'chrome.comingSoon': 'Coming soon',
    'chrome.details': 'Details',
    'chrome.showPanel': 'Show panel',
    'chrome.hidePanel': 'Hide panel',
    'chrome.panelOnly': 'Panel only',
    'chrome.language': 'Language',
    'chrome.soundHint': 'No sound? Check silent mode',
    'chrome.center': 'Center on Adonay',
    'chrome.rotate': 'Rotate',
    'chrome.isometric': 'Isometric',
    'chrome.topdown': 'Top-down',
    'chrome.perspective': 'Perspective',
    'chrome.map': 'Map',
    'chrome.primary': 'Primary',
    'chrome.dock': 'Dock',
    'chrome.audience': 'Audience',

    'boot.error': 'Failed to load:',
  },
  es: {
    'check.label': 'Primeros pasos',
    'check.walkAround': 'Camina por el mundo',
    'check.walkAround.desk': 'Haz clic en un tile para ir allí. Doble clic o Shift para correr.',
    'check.walkAround.touch': 'Toca un tile para ir allí. Doble toque en un tile para correr.',
    'check.walkKeys': 'Camina con las teclas',
    'check.walkKeys.desk':
      'Usa WASD o las flechas para mover al personaje. Camina hacia una puerta (o pulsa Enter junto a ella) para entrar.',
    'check.walkKeys.touch': 'Usa WASD o las flechas para mover al personaje.',
    'check.moveCamera': 'Mueve la cámara',
    'check.moveCamera.desk': 'Arrastra con el mouse o desliza con dos dedos en el trackpad para desplazar la vista.',
    'check.moveCamera.touch': 'Pellizca con dos dedos para mover y acercar la vista. El recuadro de recentrar vuelve a Adonay.',
    'check.zoom': 'Acerca y aleja',
    'check.zoom.desk': 'Pellizca en el trackpad, o usa Ctrl / ⌘ + rueda del mouse.',
    'check.zoom.touch': 'Pellizca con dos dedos para acercar o alejar.',
    'check.enterBuilding': 'Entra a un edificio',
    'check.enterBuilding.desk': 'Haz clic en un edificio para ir a su puerta y abrir el panel.',
    'check.enterBuilding.touch': 'Toca un edificio para ir a su puerta y abrir el panel.',
    'check.skip': 'Saltar tutorial',
    'check.close': 'Cerrar',
    'check.done': '¡Listo!',
    'check.toggle': 'Abrir o cerrar lista de pasos',

    'toast.unreachable': 'No se puede llegar',
    'toast.getOutToEnter': 'Bájate para entrar',

    'jac.hint': 'Usa flechas o WASD',
    'jac.desc': 'JAC T9, la camioneta de la familia.',
    'jac.getIn': 'Súbete',
    'jac.getOut': 'Bájate',
    'jac.info': 'Info',
    'jac.close': 'Cerrar',
    'jac.length': 'Largo',
    'jac.lights': 'Luces',
    'jac.engine': 'Motor',
    'jac.gear': 'Marcha',
    'jac.auto': 'Auto',
    'jac.off': 'Apagado',
    'jac.on': 'Encendido',
    'jac.drive': 'Conducir',
    'jac.hazards': 'Balizas',

    'canvas.label': 'Mundo isométrico de prueba',

    'panel.exit': 'Salir',
    'panel.close': 'Cerrar',
    'panel.readCase': 'Leer caso',

    'chrome.cases': 'Casos',
    'chrome.achievements': 'Logros',
    'chrome.contact': 'Contacto',
    'chrome.search': 'Buscar',
    'chrome.downloadCv': 'Descargar CV',
    'chrome.sound': 'Sonido',
    'chrome.fullPage': 'Página completa',
    'chrome.title': 'Líder de diseño con IA.',
    'chrome.titleShort': 'Líder de diseño con IA',
    'chrome.who': '¿Quién eres?',
    'chrome.mentorship': 'Mentoría',
    'chrome.client': 'Cliente',
    'chrome.experience': 'Experiencia',
    'chrome.seeAll': 'Ver todos',
    'chrome.mentorshipStat': 'Mentoría: 30+ personas',
    'chrome.comingSoon': 'Próximamente',
    'chrome.details': 'Detalles',
    'chrome.showPanel': 'Mostrar panel',
    'chrome.hidePanel': 'Ocultar panel',
    'chrome.panelOnly': 'Solo panel',
    'chrome.language': 'Idioma',
    'chrome.soundHint': '¿Sin sonido? Revisa el modo silencio',
    'chrome.center': 'Centrar en Adonay',
    'chrome.rotate': 'Rotar',
    'chrome.isometric': 'Isométrica',
    'chrome.topdown': 'Cenital',
    'chrome.perspective': 'Perspectiva',
    'chrome.map': 'Mapa',
    'chrome.primary': 'Principal',
    'chrome.dock': 'Barra',
    'chrome.audience': 'Audiencia',

    'boot.error': 'Error al cargar:',
  },
} as const;

export type I18nKey = keyof typeof DICT.en;

let lang: Lang = 'es';
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next !== 'en' && next !== 'es') return;
  if (lang === next) {
    document.documentElement.lang = next;
    return;
  }
  lang = next;
  document.documentElement.lang = next;
  for (const fn of listeners) fn();
}

export function t(key: I18nKey): string {
  return DICT[lang][key] ?? DICT.en[key] ?? key;
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
