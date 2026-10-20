#!/usr/bin/env node
/**
 * GitHub Pages deploys.
 *
 * Preview targets publish into one subfolder of gh-pages and leave the live
 * root and every other preview path alone.
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

const SITE = 'https://adonaylizardo.github.io/interactive-portfolio-playtest';
const PREFIX = '/interactive-portfolio-playtest';

/** Folder name on gh-pages. `preview` is the original /preview/ slot. */
const PREVIEW_SLOTS = [
  'preview',
  'preview-edificios',
  'preview-contenido',
  'preview-camaras',
  'preview-persona',
  'preview-integracion',
];

const argv = process.argv.slice(2);

function resolveTarget() {
  if (process.env.DEPLOY_TARGET === 'live' || argv.includes('--live') || argv.includes('live')) {
    return 'live';
  }
  for (const slot of PREVIEW_SLOTS) {
    if (
      process.env.DEPLOY_TARGET === slot ||
      argv.includes(`--${slot}`) ||
      argv.includes(slot)
    ) {
      return slot;
    }
  }
  return 'preview';
}

const target = resolveTarget();

if (target === 'live' && process.env.DEPLOY_LIVE_APPROVED !== '1') {
  console.error(
    'Refusing to deploy to the live gh-pages root.\n' +
      'Candidates go to a /preview-*/ slot.\n' +
      'Promote only after explicit QA approval:\n' +
      '  DEPLOY_TARGET=live DEPLOY_LIVE_APPROVED=1 DEPLOY_GATE_PASSED=1 npm run deploy:live',
  );
  process.exit(1);
}

const previewTarget = target !== 'live';
const base = previewTarget ? `${PREFIX}/${target}/` : `${PREFIX}/`;
const url = previewTarget ? `${SITE}/${target}/` : `${SITE}/`;

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

if (target === 'live' && process.env.QA_GATE_PREVIEW === '1') {
  console.error(
    'QA_GATE_PREVIEW=1 is preview-only. Refusing to deploy the live root with a warn-only full-frame diff.',
  );
  process.exit(1);
}
if (previewTarget) {
  // Full-frame visual diff stays in the gate but does not block /preview-*/.
  // Build, types, logos, case copy, the other sprite checks, and smoke stay blocking.
  process.env.QA_GATE_PREVIEW = '1';
} else {
  delete process.env.QA_GATE_PREVIEW;
}

if (process.env.DEPLOY_GATE_PASSED === '1') {
  run('npx tsc --pretty false');
  run(`npx vite build --base ${base}`);
} else {
  run('npm run qa:gate');
  if (previewTarget) run(`npx vite build --base ${base}`);
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing after build');
  process.exit(1);
}

rmSync(pushDir, { recursive: true, force: true });
run('git fetch origin gh-pages');
run(`git worktree add --detach ${pushDir} origin/gh-pages`);

const COMMIT_MSG = {
  preview: 'Deploy candidate to /preview/ (live root unchanged)',
  'preview-edificios': 'Deploy Teatro/Biblioteca candidate to /preview-edificios/',
  'preview-contenido': 'Deploy content candidate to /preview-contenido/',
  'preview-camaras': 'Deploy top-down camera candidate to /preview-camaras/',
  'preview-persona': 'Deploy first-person persona candidate to /preview-persona/',
  'preview-integracion': 'Deploy integration candidate to /preview-integracion/',
  live: 'Promote approved candidate to live gh-pages root',
};

try {
  if (previewTarget) {
    const dest = path.join(pushDir, target);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(dist, dest, { recursive: true });
    writeFileSync(path.join(pushDir, '.nojekyll'), '');
    writeFileSync(path.join(pushDir, '.pages-deploy'), `${target} ${new Date().toISOString()}\n`);
  } else {
    const keep = new Set(['.git', ...PREVIEW_SLOTS]);
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
    const msg = COMMIT_MSG[target] ?? `Deploy ${target}`;
    run(
      'git -c user.email=agent@cursor.com -c user.name="Cursor Agent" commit -m "' + msg + '"',
      pushDir,
    );
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
