#!/usr/bin/env node
/**
 * Build the JS side of the APK: a zip the app extracts into its private storage.
 *
 * Deploy workspace packages from the lockfile. The root pnpm architecture
 * setting includes wasm32 so sharp's WebAssembly binary is present for Android.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hostRoot = path.resolve(here, '..');
const repoRoot = path.resolve(hostRoot, '../..');
const androidLocal = path.join(repoRoot, 'packages/android-local');
// pnpm 9 deploy expects an output outside this workspace's nested package tree.
const workDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'midscene-agent-bundle-'),
);
const outFile = path.join(hostRoot, 'app/src/main/assets/agent-bundle.zip');

/**
 * Replace symlinks with their contents.
 *
 * npm and pnpm link packages (node_modules/.pnpm/..., .bin/*) and `zip` stores those
 * as link entries. The app's extractor refuses link entries for safety, so the bundle
 * must contain real files only.
 */
function dereferenceTree(dir) {
  let replaced = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = fs.realpathSync(full);
      } catch {
        fs.rmSync(full, { force: true });
        continue;
      }
      const stat = fs.statSync(target);
      fs.rmSync(full, { recursive: true, force: true });
      if (stat.isDirectory()) {
        fs.cpSync(target, full, { recursive: true, dereference: true });
      } else {
        fs.copyFileSync(target, full);
      }
      replaced += 1;
    } else if (entry.isDirectory()) {
      replaced += dereferenceTree(full);
    }
  }
  return replaced;
}

function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

if (!fs.existsSync(path.join(androidLocal, 'dist/lib/cli.js'))) {
  throw new Error(
    'android-local dist missing; run pnpm --filter @midscene/android-local build',
  );
}
run(
  'pnpm',
  [
    '--ignore-scripts',
    '--filter',
    '@midscene/android-local',
    'deploy',
    '--prod',
    workDir,
  ],
  repoRoot,
);
if (
  !fs.existsSync(
    path.join(workDir, 'node_modules/.pnpm/@img+sharp-wasm32@0.34.3'),
  )
) {
  throw new Error('sharp wasm32 missing from deployed bundle');
}

fs.cpSync(path.join(androidLocal, 'examples'), path.join(workDir, 'examples'), {
  recursive: true,
});

// Zip preserves symlinks with -y; Android's ZipInputStream exposes their target
// text as regular files, so the host recreates them from this manifest.
const links = [];
function collectLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      links.push({
        path: path.relative(workDir, absolute),
        target: fs.readlinkSync(absolute),
      });
    } else if (entry.isDirectory()) {
      collectLinks(absolute);
    }
  }
}
collectLinks(path.join(workDir, 'node_modules'));
fs.writeFileSync(
  path.join(workDir, 'bundle-links.json'),
  JSON.stringify(links),
);

// yadb powers CJK text input and pinch gestures. It ships as a top-level APK
// asset (not inside the JS bundle) because provisioning must work even before
// the agent is extracted: the app stages it in its external files directory and
// the shell copies it to /data/local/tmp (the app cannot write there itself).
const yadbSource = path.join(repoRoot, 'packages/android/bin/yadb');
if (!fs.existsSync(yadbSource)) {
  throw new Error(
    `yadb not found at ${yadbSource}; run the @midscene/android prebuild step first`,
  );
}
fs.copyFileSync(yadbSource, path.join(hostRoot, 'app/src/main/assets/yadb'));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.rmSync(outFile, { force: true });
run(
  'zip',
  [
    '-q',
    '-r',
    '-X',
    '-y',
    outFile,
    'dist',
    'node_modules',
    'examples',
    'package.json',
    'bundle-links.json',
  ],
  workDir,
);

// Stamp the bundle so the app can re-extract after an APK update: extraction is
// otherwise "exists -> skip", which would serve a stale agent forever.
const androidLocalPackage = JSON.parse(
  fs.readFileSync(path.join(androidLocal, 'package.json'), 'utf8'),
);
const bundleInfo = `${androidLocalPackage.version}-${Date.now()}`;
fs.writeFileSync(
  path.join(hostRoot, 'app/src/main/assets/bundle-info.txt'),
  `${bundleInfo}\n`,
);
console.log(`bundle info: ${bundleInfo}`);

const size = fs.statSync(outFile).size;
const yadbOut = path.join(hostRoot, 'app/src/main/assets/yadb');
console.log(`\n${outFile} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`${yadbOut} (${fs.statSync(yadbOut).size} bytes)`);
fs.rmSync(workDir, { recursive: true, force: true });
console.log('Now rebuild the app: pnpm --filter android-host assemble');
