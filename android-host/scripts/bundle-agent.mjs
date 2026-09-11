#!/usr/bin/env node
/**
 * Build the JS side of the APK: a zip the app extracts into its private storage.
 *
 * The install is done with `--cpu=wasm32` so sharp resolves to its WebAssembly
 * build — the only one that works on android-arm64 (native sharp has no such
 * prebuild). `--ignore-scripts` avoids native postinstalls entirely.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hostRoot = path.resolve(here, '..');
const repoRoot = path.resolve(hostRoot, '..');
const androidLocal = path.join(repoRoot, 'packages/android-local');
const workDir = path.join(hostRoot, 'build/agent-bundle');
const outFile = path.join(hostRoot, 'app/src/main/assets/agent-bundle.zip');

function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });
fs.writeFileSync(
  path.join(workDir, 'package.json'),
  `${JSON.stringify({ name: 'midscene-local-agent-bundle', private: true, version: '1.0.0' }, null, 2)}\n`,
);

run(
  'npm',
  [
    'install',
    '--cpu=wasm32',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
    '@midscene/core@1.12.6',
    '@midscene/shared@1.12.6',
  ],
  workDir,
);

// The workspace package is copied in by hand: its dependencies use the
// `workspace:*` protocol, which npm cannot resolve outside the monorepo.
const target = path.join(workDir, 'node_modules/@midscene/android-local');
fs.mkdirSync(target, { recursive: true });
for (const entry of ['dist', 'package.json', 'README.md', 'bin']) {
  fs.cpSync(path.join(androidLocal, entry), path.join(target, entry), {
    recursive: true,
  });
}

fs.cpSync(path.join(androidLocal, 'examples'), path.join(workDir, 'examples'), {
  recursive: true,
});

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
  ['-q', '-r', '-X', outFile, 'node_modules', 'examples', 'package.json'],
  workDir,
);

const size = fs.statSync(outFile).size;
const yadbOut = path.join(hostRoot, 'app/src/main/assets/yadb');
console.log(`\n${outFile} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`${yadbOut} (${fs.statSync(yadbOut).size} bytes)`);
console.log('Now rebuild the app: cd android-host && gradle assembleDebug');
