import type { CaseContent } from './cases';

const VOLARIS_PROBLEM =
  'En la app de reservas de Volaris (Android e iOS), Figma, las specs y el código contaban historias distintas del mismo componente dentro de un flujo de reservas. Varios sistemas de diseño se superponían, así que no quedaba claro cuál mandaba. Cada vacío se reinterpretaba más adelante, y eso traía retrabajo.';
const VOLARIS_DID =
  'Como Product Strategist (Q4 2026), yo era el único que aprobaba: limpié el archivo de Figma, lo verifiqué contra la implementación existente del flujo de reservas, y convertí cada componente en un contrato sellado explícito entre diseño y código. Agentes de IA ayudaron con borradores y auditorías; cada contrato lo revisé y sellé yo mismo.';
const VOLARIS_RESULT =
  '10 contratos sellados pasaron a ingeniería el 1 de octubre de 2026. Flujo completo: antes, de 1 a 2 días a unas 2 horas, tanto en Android como en iOS. Ingeniería ya lo implementó: lo que antes le tomaba un par de semanas, con los contratos tomó apenas días. Liderazgo le dio luz verde como proceso estándar para proyectos con problemas similares.';
const VOLARIS_RULE =
  'Diseño y código nunca se sincronizan directo. Ambos pasan primero por el contrato sellado.';
const VOLARIS_CLOSING = 'La meta no era evitar errores. Era evitar que alguien tuviera que adivinar.';

/** Faithful ES (tú, neutral Venezuelan). Numbers match `cases.ts` EN source. */
export const CASES_ES: Record<string, CaseContent> = {
  volaris: {
    headline: 'Un contrato que ingeniería no podía malinterpretar',
    subtitle: 'Product Strategist y único aprobador',
    voice: '02-volaris',
    full: [
      { kind: 'section', heading: 'Problema', paragraphs: [VOLARIS_PROBLEM] },
      {
        kind: 'section',
        heading: 'Lo que hice',
        paragraphs: [
          `${VOLARIS_DID} No se entregó código. Los entregables: contratos sellados, informes markdown de verificación y el handoff en Figma.`,
        ],
      },
      { kind: 'section', heading: 'Resultado', paragraphs: [VOLARIS_RESULT] },
      {
        kind: 'section',
        heading: 'Luego lo escalé',
        paragraphs: ['Con esa luz verde, armé una metodología para escalarlo al resto del equipo:'],
        bullets: [
          'Skills para acelerar el proceso',
          'Una lista de cursos para entrenamiento acelerado',
          'Shadowing y talleres con personas clave del proyecto',
          'Alineación con liderazgo y el cliente para una adopción adecuada',
        ],
      },
      { kind: 'section', heading: 'La regla', paragraphs: [VOLARIS_RULE] },
      { kind: 'closing', text: VOLARIS_CLOSING },
    ],
    short: [
      { kind: 'section', heading: 'Problema', paragraphs: [VOLARIS_PROBLEM] },
      { kind: 'section', heading: 'Lo que hice', paragraphs: [VOLARIS_DID] },
      { kind: 'section', heading: 'Resultado', paragraphs: [VOLARIS_RESULT] },
      {
        kind: 'section',
        heading: 'Luego lo escalé',
        paragraphs: [
          'Skills para acelerar el proceso, una lista de cursos, shadowing y talleres, y alineación con liderazgo y el cliente.',
        ],
      },
      { kind: 'section', heading: 'La regla', paragraphs: [VOLARIS_RULE] },
      { kind: 'closing', text: VOLARIS_CLOSING },
    ],
  },
  bain: {
    headline: 'Liderando a 9 diseñadores en Bain, sin dejar de entregar producto',
    shortHeadline: 'Liderando a 9 diseñadores en Bain',
    subtitle: 'Squad lead, mentor y diseñador hands-on',
    voice: '03-bain',
    full: [
      {
        kind: 'section',
        heading: 'Problema',
        paragraphs: [
          'Los diseñadores de Applaudo estaban repartidos en varios productos de Bain, cada uno embebido en su propio equipo. Sin un espacio compartido, los solapamientos y desalineaciones entre productos seguían invisibles en el portafolio.',
        ],
      },
      {
        kind: 'section',
        heading: 'Lo que hice',
        paragraphs: [
          'Fui squad lead y mentor de 9 diseñadores de Applaudo repartidos en varias cuentas de Bain. Organicé una ceremonia semanal para conectarlos, con tres bloques: una revisión de Visual Status donde los diseñadores ven trabajo en progreso lado a lado (para visibilidad horizontal en el portafolio y detectar solapamientos, no para criticar), un Experiment Tracker compartido para iniciativas del portafolio, y un bloque de Red Flags para levantar riesgos a tiempo.',
        ],
      },
      {
        kind: 'section',
        heading: 'Resultado',
        paragraphs: [
          'El CSAT del equipo de Bain sobre los diseñadores de Applaudo que trabajaron con ellos subió de cerca de 8.5 a 9.5 entre 2025 y 2026, llegando a 10 en algunos trimestres.',
        ],
      },
      {
        kind: 'section',
        heading: 'Trabajo hands-on',
        paragraphs: [],
        bullets: [
          '**Signal (Product Designer):** Construí un proceso de diseño nuevo, con documentación y pruebas, detrás de varias funciones que ya salieron. La más grande fue una vista Gantt, el release más grande de Signal hasta la fecha. También organicé un taller de feedback del equipo sobre mejoras del Gantt, y el equipo de producto de Signal adoptó el método de colaboración en video remoto que introduje.',
          '**Case Wrap MVP** (aprox. junio a agosto de 2026, Senior Product Designer / Product Strategist): Replanté el cierre de casos como revisar-y-aprobar en lugar de aceptación en un clic: borradores con IA, humanos deciden, nada de "aprobar todo". Tres direcciones codificadas en el design system de Bain convirtieron la elección en una decisión de equipo. El entregable fue una dirección MVP validada. No gané un concepto; hice barato ver la trade-off.',
          '**NPS Prism, Instrument Management** (aprox. abril a junio de 2026, diseñador único): lo que el admin llamaba "instruments" eran en realidad presets, con ownership y datos de refresh reales repartidos en hojas de cálculo fuera de la plataforma. Diseñé un modelo de dos entidades con calendario de refresh en plataforma y notificaciones. Producto e ingeniería lo aprobaron para build.',
          '**PEG:** Product Designer en la cuenta.',
          '**PAS:** diseño de producto en el Partner Assessment System en vivo de Bain.',
        ],
      },
      {
        kind: 'closing',
        text: 'Liderar el portafolio no significó alejarme del trabajo: seguí entregando producto mientras ayudaba a otros nueve diseñadores a hacer lo mismo.',
      },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          '**Problema:** Los diseñadores de Bain estaban repartidos en equipos sin espacio compartido, así que solapamientos y desalineación seguían invisibles.',
          '**Lo que hice:** Squad lead y mentor de 9 diseñadores; organicé una ceremonia semanal (Visual Status, Experiment Tracker, Red Flags).',
          '**Resultado:** El CSAT de Bain sobre los diseñadores subió de cerca de 8.5 a 9.5 entre 2025 y 2026, llegando a 10 en algunos trimestres.',
          '**Hands-on:** Vista Gantt de Signal, su release más grande; Case Wrap pasó a revisar-y-aprobar con borradores de IA; NPS Prism movió datos de ownership de hojas de cálculo al producto.',
        ],
      },
      {
        kind: 'closing',
        text: 'Liderar no significó alejarme: seguí entregando mientras nueve diseñadores ganaron claridad en el portafolio.',
      },
    ],
  },
  pg: {
    headline: 'Una app que las panelistas sí quieren abrir',
    subtitle: 'Diseñador UX/UI, app de salud para panelistas',
    voice: '06-pg',
    full: [
      {
        kind: 'section',
        heading: 'Problema',
        paragraphs: [
          'El equipo de innovación de P&G Latam necesitaba una app móvil para sus panelistas, que pudiera registrar el ciclo menstrual, recoger encuestas y correr pruebas de producto, cumpliendo los estándares de P&G en rendimiento, confiabilidad y seguridad alrededor de datos de salud personal sensibles. El tiempo apretaba.',
        ],
      },
      {
        kind: 'section',
        heading: 'Lo que hice',
        paragraphs: [
          'Como Diseñador UX/UI en Talpor, trabajé en un equipo pequeño cross-funcional (un PM, un equipo de ciencia y un diseñador UI & motion), y juntos co-creamos la app en unas 8 semanas. Las primeras 2 a 3 semanas fueron estrategia: 4 perfiles de usuario, benchmark competitivo, mapas de foco de features, flujos y wireframes. Entrevistas, pruebas heurísticas y sesiones de design thinking mostraron que la navegación debía variar por perfil, lo que moldeó un patrón de registro de acceso rápido alrededor del calendario, la rueda del ciclo y un solo botón de agregar. De ahí construimos el design system y la UI, con seguimiento de síntomas, gamificación, feed de noticias y "Diary", un sistema de encuestas y pruebas de producto ligado a la gamificación.',
        ],
      },
      {
        kind: 'section',
        heading: 'Resultado',
        paragraphs: [
          'La app salió con usuarias reales en tres idiomas (portugués, español, inglés), llegando sobre todo a panelistas en Brasil, México y EE. UU. Superó los estándares acordados de tiempo y calidad y abrió la puerta a trabajo de seguimiento con P&G.',
        ],
      },
      { kind: 'closing', text: 'Buena investigación encuentra el camino más corto al registro antes de que diseño toque una pantalla.' },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          '**Problema:** P&G necesitaba que las panelistas registraran su ciclo, respondieran encuestas y probaran productos en una app segura para datos de salud sensibles.',
          '**Lo que hice:** Como Diseñador UX/UI en Talpor, trabajé unas 8 semanas, de investigación y flujos a un design system completo y la función gamificada "Diary".',
          '**Resultado:** Lanzada en 3 idiomas para panelistas en Brasil, México y EE. UU., superando la barra acordada de tiempo y calidad.',
          '**Extra:** El flujo de registro (calendario, rueda del ciclo, botón agregar) salió directo de entrevistas y pruebas heurísticas entre perfiles.',
        ],
      },
      { kind: 'closing', text: 'Buena investigación encuentra el camino más corto al registro antes de que diseño toque una pantalla.' },
    ],
  },
  mentoria: {
    headline: 'Mentoría con la misma rigurosidad que el trabajo con clientes',
    shortHeadline: 'Mentoría como sistema',
    subtitle: 'Líder de mentoría y Design Senior Council',
    voice: '04-mentoring',
    full: [
      {
        kind: 'section',
        heading: 'Problema',
        paragraphs: [
          'El crecimiento dentro del equipo de diseño era difícil de ver, y no había una forma estructurada de apoyarlo. El equipo necesitaba las dos cosas: visibilidad de cómo se desarrollaban los diseñadores, y un sistema para hacer ese crecimiento deliberado, para que se tradujera en impacto real en cuentas de clientes y en las metas de Applaudo.',
        ],
      },
      {
        kind: 'section',
        heading: 'Lo que hice',
        paragraphs: [
          'Co-creé y ayudo a liderar el programa de mentoría de diseño de Applaudo, corrido como producto: con releases, un marco de medición y metas trimestrales, no como un perk informal. Tiene cuatro formatos de sesión: coaching 1:1 asignado, consultas reservadas on demand, invitaciones scouteadas, y sesiones y talleres de equipo en grupo. Cada sesión se etiqueta a una biblioteca compartida de competencias (pensamiento crítico, pensamiento estratégico, arquitectura de información, business acumen, y más), así el crecimiento se sigue por skill, no solo por horas. Encima hay eventos gamificados y automatizaciones de email que mantienen la participación viva entre sesiones. También estoy en el Design Senior Council de Applaudo, uno de siete asientos. En mi práctica de mentoría, cada revisión produce dos salidas: notas internas con preguntas de sondeo para mí, y feedback listo para la persona con fortalezas concretas y próximos pasos.',
        ],
      },
      {
        kind: 'section',
        heading: 'Resultado',
        paragraphs: [
          'El programa pasó de un log informal en Notion en 2023 a un sistema medido con metas trimestrales, montado en enero de 2024. Sigue a **51 diseñadores** en **11 países**, con **32** que asistieron al menos a una sesión registrada. A nivel programa, se registraron **247 sesiones atendidas**, de enero de 2024 a febrero de 2026. La asistencia global se mantuvo en **82 a 95%** cada trimestre medido de 2024 a Q1 2025, por encima de la meta del 80%. El programa también corrió **10 eventos grupales**, cada uno con **11 a 21 diseñadores**.',
        ],
      },
      {
        kind: 'section',
        heading: 'Más allá de Applaudo',
        paragraphs: [
          'En mi carrera en general, aparte de este programa, he mentorizado a más de 200 diseñadores en Applaudo, DesignLab, CareerFoundry, ADPList y otros.',
        ],
      },
      {
        kind: 'section',
        heading: 'La regla',
        paragraphs: [
          '"Diagnóstico antes de prescripción, igual que con clientes. La mentoría no es más blanda, es más developmental."',
        ],
      },
      { kind: 'closing', text: 'El crecimiento no es algo que le pase a un equipo. Es algo que tienes que diseñar.' },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          '**Problema:** El crecimiento del equipo de diseño era difícil de ver y no tenía estructura, limitando su impacto en clientes y metas de Applaudo.',
          '**Lo que hice:** Co-creé y ayudo a liderar un programa medido: coaching 1:1, consultas, invitaciones scouteadas, talleres de equipo, todo etiquetado a una biblioteca de competencias con metas trimestrales.',
          '**Resultado:** 51 diseñadores en 11 países, 247 sesiones atendidas registradas (ene 2024 a feb 2026), asistencia de 82 a 95% cada trimestre medido por encima del 80%, y 10 eventos grupales con 11 a 21 diseñadores cada uno.',
          '**Carrera:** He mentorizado a más de 200 diseñadores en Applaudo, DesignLab, CareerFoundry, ADPList y otros.',
        ],
      },
      { kind: 'closing', text: 'La mentoría no es más blanda, es más developmental.' },
    ],
  },
  finoa: {
    headline: 'Una plataforma de custodia en la que las instituciones confían de un vistazo',
    shortHeadline: 'Una plataforma de custodia en la que confían',
    subtitle: 'Diseñador UX, plataforma de custodia institucional',
    voice: '05-finoa',
    full: [
      {
        kind: 'section',
        heading: 'Problema',
        paragraphs: [
          'Finoa es un custodio regulado de activos digitales, hecho para inversores institucionales y corporaciones. La plataforma funcionaba, pero aún no dejaba hacer todo lo que los usuarios necesitaban, y tenía que pasar la barra que las grandes instituciones exigen: rendimiento, confiabilidad, seguridad. El tiempo era corto.',
        ],
      },
      {
        kind: 'section',
        heading: 'Lo que hice',
        paragraphs: [
          'Como Diseñador UX en LoremLabs, me uní a un equipo pequeño cross-funcional —un Design Director, el product manager de Finoa y dos diseñadores UI— para una co-creación de ocho semanas. Lideré la parte de investigación: entrevistas con clientes, puntos de fricción, user stories, story mapping, un mapa de foco de features y la arquitectura de información. De ahí, flujos y wireframes para las pantallas core.',
        ],
      },
      {
        kind: 'section',
        heading: 'Resultado',
        paragraphs: [
          'La plataforma principal se rediseñó y modernizó, y prototipamos la versión móvil, con un plan para iterar, probar y escalar desde ahí. Lo que habilitó el rediseño:',
        ],
        bullets: [
          'Los usuarios institucionales pueden leer cómo se mueve su portafolio en el tiempo, como harían con cualquier activo negociado.',
          'Lo pendiente o en proceso aparece en un solo sistema de notificaciones en lugar de repartido por el producto.',
          'Permisos y gestión de usuarios son más fáciles de alcanzar.',
          'Un prototipo móvil cubre las pantallas core más allá de desktop.',
        ],
      },
      { kind: 'section', paragraphs: ['Fue trabajo de diseño cualitativo; no se midió una métrica de resultado.'] },
      { kind: 'closing', text: 'Las instituciones no necesitan más features. Necesitan confiar en lo que están viendo.' },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          '**Problema:** La plataforma de Finoa funcionaba, pero los usuarios institucionales necesitaban más de lo que permitía, bajo una barra alta de seguridad y confiabilidad.',
          '**Lo que hice:** Como Diseñador UX en LoremLabs, lideré investigación e IA en una co-creación de ocho semanas: entrevistas, user stories, flujos, wireframes.',
          '**Resultado:** Seguimiento de portafolio más claro, un solo lugar para acciones pendientes, permisos más simples, más un prototipo móvil. Trabajo cualitativo; no se midieron métricas.',
        ],
      },
      { kind: 'closing', text: 'Las instituciones no necesitan más features. Necesitan confiar en lo que están viendo.' },
    ],
  },
  sambil: {
    headline: 'Sambil',
    subtitle: 'Sambil',
    voice: '10-sambil',
    full: [{ kind: 'section', paragraphs: ['Sambil, Barquisimeto. Un centro comercial con forma de cuatro, nuestra guitarrita.'] }],
    short: [{ kind: 'section', paragraphs: ['Sambil, Barquisimeto. Un centro comercial con forma de cuatro, nuestra guitarrita.'] }],
  },
  catedral: {
    headline: 'Catedral',
    subtitle: 'Catedral',
    voice: '09-cathedral',
    full: [{ kind: 'section', paragraphs: ['La Catedral de Barquisimeto. Mi ciudad tiene debilidad por las formas audaces.'] }],
    short: [{ kind: 'section', paragraphs: ['La Catedral de Barquisimeto. Mi ciudad tiene debilidad por las formas audaces.'] }],
  },
  flor: {
    headline: 'Flor de Venezuela',
    subtitle: 'Flor de Venezuela',
    voice: '08-flor-de-venezuela',
    full: [{ kind: 'section', paragraphs: ['Flor de Venezuela. Un pedazo de Barquisimeto, de donde soy.'] }],
    short: [{ kind: 'section', paragraphs: ['Flor de Venezuela. Un pedazo de Barquisimeto, de donde soy.'] }],
  },
};
