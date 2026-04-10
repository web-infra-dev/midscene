#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function main() {
  if (process.platform !== 'linux' || process.arch !== 'arm64') {
    return;
  }

  const prebuild = path.join(
    __dirname,
    '..',
    'prebuilds',
    'libnut.linux-arm64.node',
  );
  if (!fs.existsSync(prebuild)) {
    console.warn(
      '[@midscene/computer] linux-arm64 prebuild missing, skip:',
      prebuild,
    );
    return;
  }

  let linuxPkgJsonPath;
  try {
    const libnutPkgPath = require.resolve('@computer-use/libnut/package.json');
    const libnutRequire = createRequire(libnutPkgPath);
    linuxPkgJsonPath = libnutRequire.resolve(
      '@computer-use/libnut-linux/package.json',
    );
  } catch (err) {
    console.warn(
      '[@midscene/computer] cannot resolve @computer-use/libnut-linux, skip:',
      err.message,
    );
    return;
  }

  const target = path.join(
    path.dirname(linuxPkgJsonPath),
    'build',
    'Release',
    'libnut.node',
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(prebuild, target);
  console.log(
    '[@midscene/computer] installed linux-arm64 libnut.node ->',
    target,
  );
}

try {
  main();
} catch (err) {
  console.warn('[@midscene/computer] prebuild install failed:', err.message);
}
