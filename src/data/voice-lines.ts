/** Adonay's recorded lines — filenames live under `public/audio/voice/`. */
export type VoiceLine = {
  id: string;
  script_text: string;
  files: { mp3: string; ogg: string };
};

export const VOICE_LINES: Record<string, VoiceLine> = {
  '01-intro': {
    id: '01-intro',
    script_text: "Hey, welcome to my studio. I'm Adonay. Take a walk around.",
    files: { mp3: '01-intro.mp3', ogg: '01-intro.ogg' },
  },
  '02-volaris': {
    id: '02-volaris',
    script_text: 'A Latin American airline. Where we brought AI into the design-to-code flow.',
    files: { mp3: '02-volaris.mp3', ogg: '02-volaris.ogg' },
  },
  '03-bain': {
    id: '03-bain',
    script_text: 'Here I was leading a portfolio of nine designers for Bain & Company.',
    files: { mp3: '03-bain.mp3', ogg: '03-bain.ogg' },
  },
  '04-mentoring': {
    id: '04-mentoring',
    script_text: 'Take a look at my mentoring program at Applaudo. Built to grow designers.',
    files: { mp3: '04-mentoring.mp3', ogg: '04-mentoring.ogg' },
  },
  '05-finoa': {
    id: '05-finoa',
    script_text: 'This is Finoa. Crypto custody for institutions, redesigned from research in about eight weeks.',
    files: { mp3: '05-finoa.mp3', ogg: '05-finoa.ogg' },
  },
  '06-pg': {
    id: '06-pg',
    script_text: 'P&G Happy Changes. One app, three countries, three languages.',
    files: { mp3: '06-pg.mp3', ogg: '06-pg.ogg' },
  },
  '07-achievement': {
    id: '07-achievement',
    script_text: 'Nice, you found one.',
    files: { mp3: '07-achievement.mp3', ogg: '07-achievement.ogg' },
  },
  '08-flor-de-venezuela': {
    id: '08-flor-de-venezuela',
    script_text: "Flor de Venezuela. A piece of Barquisimeto, where I'm from.",
    files: { mp3: '08-flor-de-venezuela.mp3', ogg: '08-flor-de-venezuela.ogg' },
  },
  '09-cathedral': {
    id: '09-cathedral',
    script_text: "Barquisimeto's Cathedral. My city has a thing for bold shapes.",
    files: { mp3: '09-cathedral.mp3', ogg: '09-cathedral.ogg' },
  },
  '10-sambil': {
    id: '10-sambil',
    script_text: 'Sambil, Barquisimeto. A mall shaped like a cuatro, our little guitar.',
    files: { mp3: '10-sambil.mp3', ogg: '10-sambil.ogg' },
  },
  '11-contact': {
    id: '11-contact',
    script_text: "Like what you see? Let's talk.",
    files: { mp3: '11-contact.mp3', ogg: '11-contact.ogg' },
  },
  '12-climbing-wall': {
    id: '12-climbing-wall',
    script_text: 'This is our climbing wall at home. Noah, Joys and me, one hold at a time.',
    files: { mp3: '12-climbing-wall.mp3', ogg: '12-climbing-wall.ogg' },
  },
};
