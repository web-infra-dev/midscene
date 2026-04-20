#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const sourceFile = path.join(packageRoot, 'native', 'rdp-helper.m');
const outputDir = path.join(packageRoot, 'bin', 'darwin');
const outputFile = path.join(outputDir, 'rdp-helper');

if (process.platform !== 'darwin') {
  console.warn(
    `[build:native] Skipping @midscene/rdp helper build on unsupported platform ${process.platform}`,
  );
  process.exit(0);
}

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
  mkdirSync(outputDir, { recursive: true });

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
    outputFile,
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

  console.log(`[build:native] Built ${path.relative(packageRoot, outputFile)}`);
} catch (error) {
  console.error(
    `[build:native] Failed to build @midscene/rdp helper: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
