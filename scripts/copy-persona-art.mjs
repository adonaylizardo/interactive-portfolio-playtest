#!/usr/bin/env node
/** Copy art/primera-persona assets into dist (and public for dev). */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'art', 'primera-persona');

function copyTo(destRoot) {
  for (const sub of ['piezas', 'frames']) {
    const from = path.join(src, sub);
    const to = path.join(destRoot, 'primera-persona', sub);
    if (!existsSync(from)) {
      console.error('Missing', from);
      process.exit(1);
    }
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }
  cpSync(path.join(src, 'piezas.json'), path.join(destRoot, 'primera-persona', 'piezas.json'));
}

const dist = path.join(root, 'dist');
if (existsSync(dist)) copyTo(dist);
const pub = path.join(root, 'public', 'primera-persona');
mkdirSync(path.join(root, 'public'), { recursive: true });
copyTo(path.join(root, 'public'));
console.log('Copied primera-persona art to dist/ and public/');
