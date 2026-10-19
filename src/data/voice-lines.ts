/** Adonay's recorded lines — filenames live under `public/audio/voice/`. */
export type VoiceLine = {
  id: string;
  script_text: string;
  script_text_es?: string;
  files: { mp3: string; ogg: string };
};

export const VOICE_LINES: Record<string, VoiceLine> = {
  '01-intro': {
    id: '01-intro',
    script_text: "Hey, welcome to my studio. I'm Adonay. Take a walk around.",
    script_text_es: 'Hola, bienvenido a mi estudio. Soy Adonay. Échale un vistazo al mapa.',
    files: { mp3: '01-intro.mp3', ogg: '01-intro.ogg' },
  },
  '02-volaris': {
    id: '02-volaris',
    script_text: 'A Latin American airline. Where we brought AI into the design-to-code flow.',
    script_text_es: 'Una aerolínea latinoamericana. Aquí llevamos IA al flujo de diseño a código.',
    files: { mp3: '02-volaris.mp3', ogg: '02-volaris.ogg' },
  },
  '03-bain': {
    id: '03-bain',
    script_text: 'Here I was leading a portfolio of nine designers for Bain & Company.',
    script_text_es: 'Aquí lideraba un portafolio de nueve diseñadores para Bain & Company.',
    files: { mp3: '03-bain.mp3', ogg: '03-bain.ogg' },
  },
  '04-mentoring': {
    id: '04-mentoring',
    script_text: 'Take a look at my mentoring program at Applaudo. Built to grow designers.',
    script_text_es: 'Mira mi programa de mentoría en Applaudo. Hecho para hacer crecer diseñadores.',
    files: { mp3: '04-mentoring.mp3', ogg: '04-mentoring.ogg' },
  },
  '05-finoa': {
    id: '05-finoa',
    script_text: 'This is Finoa. Crypto custody for institutions, redesigned from research in about eight weeks.',
    script_text_es: 'Esto es Finoa. Custodia crypto para instituciones, rediseñada desde research en unas ocho semanas.',
    files: { mp3: '05-finoa.mp3', ogg: '05-finoa.ogg' },
  },
  '06-pg': {
    id: '06-pg',
    script_text: 'P&G Happy Changes. One app, three countries, three languages.',
    script_text_es: 'P&G Happy Changes. Una app, tres países, tres idiomas.',
    files: { mp3: '06-pg.mp3', ogg: '06-pg.ogg' },
  },
  '07-achievement': {
    id: '07-achievement',
    script_text: 'Nice, you found one.',
    script_text_es: 'Bien, encontraste uno.',
    files: { mp3: '07-achievement.mp3', ogg: '07-achievement.ogg' },
  },
  '08-flor-de-venezuela': {
    id: '08-flor-de-venezuela',
    script_text: "Flor de Venezuela. A piece of Barquisimeto, where I'm from.",
    script_text_es: 'Flor de Venezuela. Un pedazo de Barquisimeto, de donde soy.',
    files: { mp3: '08-flor-de-venezuela.mp3', ogg: '08-flor-de-venezuela.ogg' },
  },
  '09-cathedral': {
    id: '09-cathedral',
    script_text: "Barquisimeto's Cathedral. My city has a thing for bold shapes.",
    script_text_es: 'La Catedral de Barquisimeto. Mi ciudad tiene debilidad por las formas audaces.',
    files: { mp3: '09-cathedral.mp3', ogg: '09-cathedral.ogg' },
  },
  '10-sambil': {
    id: '10-sambil',
    script_text: 'Sambil, Barquisimeto. A mall shaped like a cuatro, our little guitar.',
    script_text_es: 'Sambil, Barquisimeto. Un centro comercial con forma de cuatro, nuestra guitarrilla.',
    files: { mp3: '10-sambil.mp3', ogg: '10-sambil.ogg' },
  },
  '11-contact': {
    id: '11-contact',
    script_text: "Like what you see? Let's talk.",
    script_text_es: '¿Te gusta lo que ves? Hablemos.',
    files: { mp3: '11-contact.mp3', ogg: '11-contact.ogg' },
  },
  '12-climbing-wall': {
    id: '12-climbing-wall',
    script_text: 'This is our climbing wall at home. Noah, Joys and me, one hold at a time.',
    script_text_es: 'Este es nuestro muro de escalada en casa. Noah, Joys y yo, agarre a agarre.',
    files: { mp3: '12-climbing-wall.mp3', ogg: '12-climbing-wall.ogg' },
  },
};
