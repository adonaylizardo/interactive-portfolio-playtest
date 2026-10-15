#!/usr/bin/env node
/**
 * Public case-copy greps: the four new panels plus airline/landmarks in src/data/cases.ts
 * and the production build must not leak draft markers, Volaris, or placeholder Spanish,
 * and 9.5 must only appear in the Bain case.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/data/cases.ts');
const DIST = path.join(ROOT, 'dist');
const errors = [];

const src = fs.readFileSync(SRC, 'utf8');

const FORBIDDEN = [
  [/\[FALTA\]/i, '[FALTA]'],
  [/Caso de ejemplo/i, 'Caso de ejemplo'],
  [/Contenido provisional/i, 'Contenido provisional'],
  [/Omitted brief facts/, 'Omitted brief facts'],
  [/Brief facts left out/, 'Brief facts left out'],
  [/Change notes/, 'Change notes'],
  [/testimonial/i, 'testimonial'],
  [/Lorem ipsum/i, 'Lorem ipsum'],
  [/\bVolaris\b/, 'Volaris'],
];

for (const [re, label] of FORBIDDEN) {
  if (re.test(src)) errors.push(`src/data/cases.ts contains ${label}`);
}

const bainStart = src.indexOf('\n  bain:');
const pgStart = src.indexOf('\n  pg:');
if (bainStart < 0 || pgStart < 0 || pgStart < bainStart) {
  errors.push('could not isolate the Bain case block in src/data/cases.ts');
} else {
  const bain = src.slice(bainStart, pgStart);
  const rest = src.slice(0, bainStart) + src.slice(pgStart);
  if (!/9\.5/.test(bain)) errors.push('Bain case copy is missing 9.5');
  const leaked = rest.match(/9\.5/g);
  if (leaked) errors.push(`9.5 appears outside Bain (${leaked.length} time(s) in the rest of cases.ts)`);
}

if (!src.includes('${name} — a landmark of the map. More coming soon.')) {
  errors.push('landmark copy missing: <Name> — a landmark of the map. More coming soon.');
}
for (const id of ["sambil: landmarkPlaceholder('Sambil'", "catedral: landmarkPlaceholder('Catedral'", "flor: landmarkPlaceholder('Flor de Venezuela'"]) {
  if (!src.includes(id)) errors.push(`landmark room missing: ${id})`);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|css|html|json)$/.test(name)) out.push(p);
  }
  return out;
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  errors.push('dist/index.html missing; run a production build before this check');
} else {
  const distFiles = walk(DIST);
  const distText = distFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const [re, label] of FORBIDDEN) {
    if (label === 'Volaris') continue;
    if (re.test(distText)) errors.push(`dist contains ${label}`);
  }
  const volarisInCases = /Leading 9 designers[\s\S]{0,200}Volaris|Volaris[\s\S]{0,80}booking app/;
  if (volarisInCases.test(distText)) errors.push('dist case copy names Volaris');
  if (!/8\.5 to 9\.5/.test(distText)) errors.push('dist is missing Bain CSAT 8.5 to 9.5');
  if (/9\.5\/10/.test(distText)) errors.push('dist still has the old Bain 9.5/10 line');
}

if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('check-case-copy: cases.ts and dist have no [FALTA]/Volaris/placeholder leaks; 9.5 only in Bain');
