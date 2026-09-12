#!/usr/bin/env node
/**
 * Build the JS half of the APK: a flat, link-free tree the app can extract.
 *
 * Design rules, each of which came from a failure on a real device:
 *  - dependencies are declared in a staging package.json, so npm resolves the whole
 *    tree (a hand-copied package once shipped without `debug` and died on the phone);
 *  - the install is hoisted and link-free (pnpm's `.pnpm` farm was dereferenced into a
 *    73MB bundle and its links could not be recreated inside the app's sandbox);
 *  - the CLI is started before packaging, so a bundle that cannot run never ships;
 *  - the workspace package is copied in last, after the install, so nothing removes it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hostRoot = path.resolve(here, '..');
const repoRoot = path.resolve(hostRoot, '../..');
const androidLocal = path.join(repoRoot, 'packages/android-local');
const workDir = path.join(hostRoot, 'build/agent-bundle');
const outFile = path.join(hostRoot, 'app/src/main/assets/agent-bundle.zip');
const androidLocalVersion = JSON.parse(
  fs.readFileSync(path.join(androidLocal, 'package.json'), 'utf8'),
).version;

function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function findLinks(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      found.push(path.relative(workDir, absolute));
    } else if (entry.isDirectory()) {
      findLinks(absolute, found);
    }
  }
  return found;
}

// 1. staging area
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });

// 2. every runtime dependency, declared up front
const workspaceManifest = JSON.parse(
  fs.readFileSync(path.join(androidLocal, 'package.json'), 'utf8'),
);
const dependencies = {
  '@midscene/core': androidLocalVersion,
  '@midscene/shared': androidLocalVersion,
};
for (const [name, range] of Object.entries(
  workspaceManifest.dependencies ?? {},
)) {
  if (!name.startsWith('@midscene/')) {
    dependencies[name] = range;
  }
}
fs.writeFileSync(
  path.join(workDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'midscene-agent-bundle',
      private: true,
      version: '1.0.0',
      dependencies,
    },
    null,
    2,
  )}\n`,
);
console.log(`staging dependencies: ${Object.keys(dependencies).join(', ')}`);

// 3. flat, script-free install (wasm sharp is the only Android-compatible build)
run(
  'npm',
  [
    'install',
    '--install-strategy=hoisted',
    '--cpu=wasm32',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
  ],
  workDir,
);

// 4. the workspace package last: npm cannot resolve `workspace:*`
const target = path.join(workDir, 'node_modules/@midscene/android-local');
fs.mkdirSync(target, { recursive: true });
for (const entry of ['dist', 'package.json', 'bin']) {
  fs.cpSync(path.join(androidLocal, entry), path.join(target, entry), {
    recursive: true,
    dereference: true,
  });
}
fs.cpSync(path.join(androidLocal, 'examples'), path.join(workDir, 'examples'), {
  recursive: true,
  dereference: true,
});

// 5. remove the link farm npm leaves behind (.bin shims, plus anything a package
// manager linked): the agent only needs the package trees, and links cannot be
// extracted inside the app's sandbox.
fs.rmSync(path.join(workDir, 'node_modules/.bin'), {
  recursive: true,
  force: true,
});
for (const link of findLinks(path.join(workDir, 'node_modules'))) {
  fs.rmSync(path.join(workDir, link), { recursive: true, force: true });
  console.log(`dropped link ${link}`);
}
const remaining = findLinks(path.join(workDir, 'node_modules'));
if (remaining.length > 0) {
  throw new Error(
    `bundle still contains links: ${remaining.slice(0, 3).join(', ')}`,
  );
}

// 6. prove it runs before it ships
const cli = path.join(target, 'dist/lib/cli.js');
if (!fs.existsSync(cli)) {
  throw new Error(`bundle is missing the CLI at ${cli}`);
}
execFileSync(process.execPath, [cli, '--version'], {
  cwd: workDir,
  stdio: 'inherit',
});
console.log('smoke test passed: the bundled CLI starts');

// 8. yadb (CJK input) ships as a top-level asset, not inside the bundle
const yadbSource = path.join(repoRoot, 'packages/android/bin/yadb');
if (!fs.existsSync(yadbSource)) {
  throw new Error(`yadb not found at ${yadbSource}`);
}
fs.copyFileSync(yadbSource, path.join(hostRoot, 'app/src/main/assets/yadb'));

// 9. zip it and stamp it, so an APK update re-extracts the agent
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.rmSync(outFile, { force: true });
run(
  'zip',
  ['-q', '-r', '-X', outFile, 'node_modules', 'examples', 'package.json'],
  workDir,
);
fs.writeFileSync(
  path.join(hostRoot, 'app/src/main/assets/bundle-info.txt'),
  `${androidLocalVersion}-${Date.now()}\n`,
);

const size = fs.statSync(outFile).size;
console.log(`\n${outFile} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log('Now rebuild the app: pnpm --filter android-host assemble');
