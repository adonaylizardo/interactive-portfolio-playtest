#!/usr/bin/env node
/**
 * GitHub Pages deploys.
 *
 * Default (and `npm run deploy:preview`): publish the build to
 *   https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/
 * without touching the live root.
 *
 * Live root is only updated when QA has explicitly approved:
 *   DEPLOY_TARGET=live DEPLOY_LIVE_APPROVED=1 npm run deploy:live
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pushDir = path.join(root, '.gh-pages-push');

const LIVE_BASE = '/interactive-portfolio-playtest/';
const PREVIEW_BASE = '/interactive-portfolio-playtest/preview/';
const LIVE_URL = 'https://adonaylizardo.github.io/interactive-portfolio-playtest/';
const PREVIEW_URL = 'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/';

const argv = process.argv.slice(2);
const target =
  process.env.DEPLOY_TARGET === 'live' || argv.includes('--live') || argv.includes('live')
    ? 'live'
    : 'preview';

if (target === 'live' && process.env.DEPLOY_LIVE_APPROVED !== '1') {
  console.error(
    'Refusing to deploy to the live gh-pages root.\n' +
      'Candidates go to /preview/ (npm run deploy:preview).\n' +
      'Promote only after explicit QA approval:\n' +
      '  DEPLOY_TARGET=live DEPLOY_LIVE_APPROVED=1 DEPLOY_GATE_PASSED=1 npm run deploy:live',
  );
  process.exit(1);
}

const base = target === 'live' ? LIVE_BASE : PREVIEW_BASE;
const url = target === 'live' ? LIVE_URL : PREVIEW_URL;

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

if (process.env.DEPLOY_GATE_PASSED === '1') {
  run('npx tsc --pretty false');
  run(`npx vite build --base ${base}`);
} else {
  run('npm run qa:gate');
  if (target === 'preview') run(`npx vite build --base ${base}`);
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing after build');
  process.exit(1);
}

rmSync(pushDir, { recursive: true, force: true });
run('git fetch origin gh-pages');
run(`git worktree add --detach ${pushDir} origin/gh-pages`);

try {
  if (target === 'preview') {
    const dest = path.join(pushDir, 'preview');
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(dist, dest, { recursive: true });
    writeFileSync(path.join(pushDir, '.nojekyll'), '');
  } else {
    const keep = new Set(['.git', 'preview']);
    for (const name of readdirSync(pushDir)) {
      if (keep.has(name)) continue;
      rmSync(path.join(pushDir, name), { recursive: true, force: true });
    }
    cpSync(dist, pushDir, { recursive: true });
    writeFileSync(path.join(pushDir, '.nojekyll'), '');
  }

  run('git add -A', pushDir);
  const dirty = execSync('git status --porcelain', { cwd: pushDir, encoding: 'utf8' }).trim();
  if (!dirty) {
    console.log(`No gh-pages changes for ${target} (${url})`);
  } else {
    const msg =
      target === 'preview'
        ? 'Deploy candidate to /preview/ (live root unchanged)'
        : 'Promote approved candidate to live gh-pages root';
    run('git -c user.email=agent@cursor.com -c user.name="Cursor Agent" commit -m "' + msg + '"', pushDir);
    run('git push origin HEAD:gh-pages', pushDir);
  }
} finally {
  try {
    run(`git worktree remove --force ${pushDir}`);
  } catch {
    rmSync(pushDir, { recursive: true, force: true });
    try {
      run('git worktree prune');
    } catch {
      /* ignore */
    }
  }
}

console.log(`Deployed ${target} → ${url}`);
