#!/usr/bin/env node
/**
 * Build the JS half of the APK: a flat, link-free tree the app can extract.
 *
 * Install the locked runtime dependency tree with pnpm, then replace Midscene
 * packages with the current workspace builds. The extracted bundle must have
 * no symlinks because Android's asset extraction cannot recreate them.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hostRoot = path.resolve(here, '..');
const repoRoot = path.resolve(hostRoot, '../..');
const androidLocal = path.join(repoRoot, 'packages/android-local');
const bundleManifest = path.join(here, 'agent-bundle.package.json');
const bundleLock = path.join(here, 'agent-bundle.pnpm-lock.yaml');
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

// 2. Verify that the locked dependency manifest still matches this workspace.
const workspaceManifest = JSON.parse(
  fs.readFileSync(path.join(androidLocal, 'package.json'), 'utf8'),
);
const lockedManifest = JSON.parse(fs.readFileSync(bundleManifest, 'utf8'));
const expected = {
  '@midscene/core': androidLocalVersion,
  '@midscene/shared': androidLocalVersion,
  ...Object.fromEntries(
    Object.entries(workspaceManifest.dependencies ?? {}).filter(
      ([name]) => !name.startsWith('@midscene/'),
    ),
  ),
};
if (JSON.stringify(lockedManifest.dependencies) !== JSON.stringify(expected)) {
  throw new Error(
    'agent-bundle.package.json is out of sync with android-local; update its dependencies and lockfile',
  );
}
fs.copyFileSync(bundleManifest, path.join(workDir, 'package.json'));
fs.copyFileSync(bundleLock, path.join(workDir, 'pnpm-lock.yaml'));

// 3. Flat, script-free install. The manifest includes sharp's wasm32 build.
run(
  'pnpm',
  [
    'install',
    '--frozen-lockfile',
    '--ignore-workspace',
    '--config.node-linker=hoisted',
    '--ignore-scripts',
  ],
  workDir,
);

// 4. Use the workspace builds, not the corresponding published packages.
for (const name of ['core', 'shared']) {
  const source = path.join(repoRoot, 'packages', name);
  const destination = path.join(workDir, 'node_modules/@midscene', name);
  const localManifest = JSON.parse(
    fs.readFileSync(path.join(source, 'package.json'), 'utf8'),
  );
  const installedManifest = JSON.parse(
    fs.readFileSync(path.join(destination, 'package.json'), 'utf8'),
  );
  const externalDependencies = (manifest) =>
    Object.fromEntries(
      Object.entries(manifest.dependencies ?? {}).filter(
        ([dependency]) => !dependency.startsWith('@midscene/'),
      ),
    );
  if (
    localManifest.version !== androidLocalVersion ||
    JSON.stringify(externalDependencies(localManifest)) !==
      JSON.stringify(externalDependencies(installedManifest))
  ) {
    throw new Error(
      `locked ${name} dependencies differ from the workspace build`,
    );
  }
  fs.rmSync(path.join(destination, 'dist'), { recursive: true, force: true });
  fs.cpSync(path.join(source, 'dist'), path.join(destination, 'dist'), {
    recursive: true,
    dereference: true,
  });
  fs.copyFileSync(
    path.join(source, 'package.json'),
    path.join(destination, 'package.json'),
  );
}

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

// 5. Remove command shims and any remaining symlinks before zipping.
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
execFileSync(
  process.execPath,
  ['-e', 'require("sharp").versions.sharp || process.exit(1)'],
  {
    cwd: workDir,
    stdio: 'inherit',
  },
);

// 7. yadb (CJK input) ships as a top-level asset, not inside the bundle
const yadbSource = path.join(repoRoot, 'packages/android/bin/yadb');
if (!fs.existsSync(yadbSource)) {
  throw new Error(`yadb not found at ${yadbSource}`);
}
fs.copyFileSync(yadbSource, path.join(hostRoot, 'app/src/main/assets/yadb'));

// 8. Zip it and stamp it, so an APK update re-extracts the agent.
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
