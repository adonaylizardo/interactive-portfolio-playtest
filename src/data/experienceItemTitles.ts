/** Localized Charlas / Biblioteca item titles (excerpt, list, reader). */
export const EXPERIENCE_ITEM_TITLES_EN = {
  'talks.items.innova360-2025.title':
    'How to hack your career when everything is against you (literally)',
  'talks.items.yt-EBecBkHkRos.title': 'How to create businesses in pandemic times',
  'talks.items.yt-aCHPQatcjWQ.title': 'How to unlock your true potential',
  'talks.items.yt-gK6rYI__wag.title': 'Creating an MVP',
  'talks.items.sinergia-como-hackear-tu-motivacion.title': 'How to hack your motivation',
  'talks.items.sinergia-la-solucion-para-que-dejes-de-sabotearte.title':
    'How to stop sabotaging yourself',
  'talks.items.sinergia-el-verdadero-problema-eres-tu.title': 'The real problem is you',
  'talks.items.sinergia-como-empezar-tu-dia-adecuadamente.title':
    'How to start your day right (according to science)',
  'talks.items.sinergia-como-ser-mas-inteligente.title': 'How to be smarter',
  'talks.items.sinergia-la-comunicacion-intencional-en-los.title':
    'Intentional communication in business: functional ugly, dazzling beauty, or strategic middle?',
  'talks.items.sinergia-la-brillantez-no-es-un-accidente.title':
    "Brilliance isn't accidental—it's forged",
  'talks.items.sinergia-tu-capacidad-de-disfrute-esta-en.title':
    'Your capacity for joy is at risk of extinction',
  'talks.items.sinergia-eres-un-ladron-de-crecimiento-ajeno.title':
    "You're stealing other people's growth",
  'talks.items.sinergia-todos-le-creyeron-a-la-ia-todos-se.title':
    'Everyone believed AI. Everyone was wrong.',

  'writings.items.ux-tricks-to-boost-customer-retention.title':
    'UX Tricks to boost customer retention',
  'writings.items.top-10-tools-for-ux-design-and-research.title':
    'Top 10 tools for UX design and research',
  'writings.items.how-to-streamline-the-construction-of-digital-products-with-ux-consulting.title':
    'How to streamline digital products with UX consulting',
  'writings.items.pixels-in-orbit-a-short-story-about-how-my-designs-made-it-to-space.title':
    'Pixels in Orbit: How my designs made it to space',
  'writings.items.googles-heart-method-what-how-the-perks.title':
    "Google's HEART method — what, how & the perks",
} as const;

export const EXPERIENCE_ITEM_TITLES_ES = {
  'talks.items.innova360-2025.title':
    'Cómo hackear tu carrera cuando todo está en tu contra (literalmente)',
  'talks.items.yt-EBecBkHkRos.title': 'Cómo crear negocios en tiempos de pandemia',
  'talks.items.yt-aCHPQatcjWQ.title': 'Cómo liberar tu verdadero potencial',
  'talks.items.yt-gK6rYI__wag.title': 'Creando un MVP',
  'talks.items.sinergia-como-hackear-tu-motivacion.title': 'Cómo hackear tu motivación',
  'talks.items.sinergia-la-solucion-para-que-dejes-de-sabotearte.title':
    'La solución para que dejes de sabotearte',
  'talks.items.sinergia-el-verdadero-problema-eres-tu.title': 'El verdadero problema, eres tú',
  'talks.items.sinergia-como-empezar-tu-dia-adecuadamente.title':
    'Cómo empezar tu día adecuadamente (según la ciencia)',
  'talks.items.sinergia-como-ser-mas-inteligente.title': 'Cómo ser más inteligente',
  'talks.items.sinergia-la-comunicacion-intencional-en-los.title':
    'La Comunicación Intencional en los Negocios: ¿Feo Funcional, Bello Deslumbrante o Punto Medio Estratégico?',
  'talks.items.sinergia-la-brillantez-no-es-un-accidente.title':
    'La Brillantez no es un accidente, se forja',
  'talks.items.sinergia-tu-capacidad-de-disfrute-esta-en.title':
    'Tu capacidad de disfrute está en peligro de extinción',
  'talks.items.sinergia-eres-un-ladron-de-crecimiento-ajeno.title':
    'Eres un ladrón de crecimiento ajeno',
  'talks.items.sinergia-todos-le-creyeron-a-la-ia-todos-se.title':
    'Todos le creyeron a la IA. Todos se equivocaron.',

  'writings.items.ux-tricks-to-boost-customer-retention.title':
    'Trucos de UX para mejorar la retención de clientes',
  'writings.items.top-10-tools-for-ux-design-and-research.title':
    'Top 10 herramientas para diseño e investigación UX',
  'writings.items.how-to-streamline-the-construction-of-digital-products-with-ux-consulting.title':
    'Cómo agilizar productos digitales con consultoría UX',
  'writings.items.pixels-in-orbit-a-short-story-about-how-my-designs-made-it-to-space.title':
    'Píxeles en órbita: cómo mis diseños llegaron al espacio',
  'writings.items.googles-heart-method-what-how-the-perks.title':
    'Método HEART de Google: qué es, cómo y ventajas',
} as const;

export function experienceItemTitleKey(kind: 'talks' | 'writings', id: string): string {
  return `${kind}.items.${id}.title`;
}
