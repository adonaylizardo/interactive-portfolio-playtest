#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const md = readFileSync(path.join(root, 'src/data/about.md'), 'utf8');

assert.match(md, /Let\u2019s dive in/, 'about.md uses curly apostrophe on dive-in line');

function normApostrophes(s) {
  return s.replace(/[\u2018\u2019\u2032`´]/g, "'");
}

function isDiveInLine(line) {
  return normApostrophes(line.trim()).toLowerCase().startsWith("let's dive in");
}

const diveLine = md.split('\n').find((l) => l.includes('dive in'));
assert.ok(diveLine && isDiveInLine(diveLine), 'dive-in line must match normalized apostrophe');

console.log('test-about-intro-split: ok');
