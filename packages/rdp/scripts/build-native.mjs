#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const sourceFile = path.join(packageRoot, 'native', 'rdp-helper.m');
const platformTargets = {
  darwin: {
    outputDir: path.join(packageRoot, 'bin', 'darwin'),
    outputFile: path.join(packageRoot, 'bin', 'darwin', 'rdp-helper'),
    buildStrategy: 'legacy-objc',
  },
  linux: {
    outputDir: path.join(packageRoot, 'bin', 'linux'),
    outputFile: path.join(packageRoot, 'bin', 'linux', 'rdp-helper'),
    buildStrategy: 'cmake-scaffold',
  },
  win32: {
    outputDir: path.join(packageRoot, 'bin', 'win32'),
    outputFile: path.join(packageRoot, 'bin', 'win32', 'rdp-helper.exe'),
    buildStrategy: 'cmake-scaffold',
  },
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout.trim();
}

try {
  const target = platformTargets[process.platform];
  if (!target) {
    console.warn(
      `[build:native] Skipping @midscene/rdp helper build on unsupported platform ${process.platform}`,
    );
    process.exit(0);
  }

  if (target.buildStrategy !== 'legacy-objc') {
    console.warn(
      `[build:native] Cross-platform helper scaffolding exists for ${process.platform}, but the real native build is not wired yet.`,
    );
    process.exit(0);
  }

  mkdirSync(target.outputDir, { recursive: true });

  const cflags = run('pkg-config', ['--cflags', 'freerdp3', 'freerdp-client3'])
    .split(/\s+/)
    .filter(Boolean);
  const libs = run('pkg-config', ['--libs', 'freerdp3', 'freerdp-client3'])
    .split(/\s+/)
    .filter(Boolean);

  const clangArgs = [
    '-O2',
    '-fobjc-arc',
    sourceFile,
    '-o',
    target.outputFile,
    '-framework',
    'Foundation',
    '-framework',
    'CoreGraphics',
    '-framework',
    'ImageIO',
    ...cflags,
    ...libs,
  ];

  const compileResult = spawnSync('clang', clangArgs, {
    cwd: packageRoot,
    stdio: 'inherit',
  });

  if (compileResult.status !== 0) {
    process.exit(compileResult.status || 1);
  }

  console.log(
    `[build:native] Built ${path.relative(packageRoot, target.outputFile)}`,
  );
} catch (error) {
  console.error(
    `[build:native] Failed to build @midscene/rdp helper: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
