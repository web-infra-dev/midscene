const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.join(__dirname, '..');

// 1. Build report if dist doesn't exist (needed by core's USE_DEV_REPORT)
const reportHtml = path.join(root, 'apps/report/dist/index.html');
if (!fs.existsSync(reportHtml)) {
  console.log('[dev-prepare] Building report...');
  execSync('npx nx build @midscene/report', { cwd: root, stdio: 'inherit' });
}

// 2. Build playground if dist doesn't exist
const playgroundDist = path.join(root, 'apps/playground/dist/index.html');
if (!fs.existsSync(playgroundDist)) {
  console.log('[dev-prepare] Building playground...');
  execSync('npx nx build playground', { cwd: root, stdio: 'inherit' });
}

// 3. Symlink playground static dirs → apps/playground/dist
const symlinks = [
  {
    link: path.join(root, 'packages/playground/static'),
    target: '../../apps/playground/dist',
  },
  {
    link: path.join(root, 'packages/ios/static'),
    target: '../../apps/playground/dist',
  },
];

for (const { link, target } of symlinks) {
  const stat = fs.lstatSync(link, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) continue; // already set up
  if (stat) fs.rmSync(link, { recursive: true });
  fs.symlinkSync(target, link);
  console.log(
    `[dev-prepare] Symlinked ${path.relative(root, link)} → ${target}`,
  );
}

console.log('[dev-prepare] Ready.');
