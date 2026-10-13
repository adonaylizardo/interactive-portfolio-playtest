import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const stage = path.join(root, '.gh-pages-stage');

// Same fast checks as the CI gate (builds dist/ first); a failure stops the deploy.
if (process.env.DEPLOY_GATE_PASSED === '1') execSync('npm run build', { cwd: root, stdio: 'inherit' });
else execSync('npm run qa:gate', { cwd: root, stdio: 'inherit' });

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(dist, stage, { recursive: true });
writeFileSync(path.join(stage, '.nojekyll'), '');

const remote = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();

rmSync(path.join(root, '.gh-pages-push'), { recursive: true, force: true });
mkdirSync(path.join(root, '.gh-pages-push'), { recursive: true });
cpSync(stage, path.join(root, '.gh-pages-push'), { recursive: true });

const pushDir = path.join(root, '.gh-pages-push');
execSync('git init', { cwd: pushDir, stdio: 'inherit' });
execSync('git checkout -b gh-pages', { cwd: pushDir, stdio: 'inherit' });
execSync('git add -A', { cwd: pushDir, stdio: 'inherit' });
execSync('git -c user.email=agent@cursor.com -c user.name="Cursor Agent" commit -m "Deploy playtest preview"', {
  cwd: pushDir,
  stdio: 'inherit',
});
execSync(`git remote add origin ${remote}`, { cwd: pushDir, stdio: 'inherit' });
execSync('git push -f origin gh-pages', { cwd: pushDir, stdio: 'inherit' });

rmSync(stage, { recursive: true, force: true });
rmSync(pushDir, { recursive: true, force: true });

console.log('Deployed dist/ to branch gh-pages (with .nojekyll)');
