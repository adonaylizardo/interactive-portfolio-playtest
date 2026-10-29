#!/usr/bin/env node
/** Local static server matching gh-pages layout for /interactive-portfolio-playtest/preview-edificios/ */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const prefix = '/interactive-portfolio-playtest/preview-edificios';
const port = Number(process.env.PREVIEW_PORT ?? 4195);

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  let url = req.url?.split('?')[0] ?? '/';
  if (url.startsWith(prefix)) url = url.slice(prefix.length) || '/';
  if (url === '/') url = '/index.html';
  const file = path.join(dist, url);
  if (!file.startsWith(dist) || !existsSync(file)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, '127.0.0.1', () => {
  console.log(`preview-edificios: http://127.0.0.1:${port}${prefix}/`);
});
