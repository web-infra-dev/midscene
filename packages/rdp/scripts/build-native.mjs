#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const nativeRoot = path.join(packageRoot, 'native');
const buildRoot = path.join(packageRoot, '.native-build');

const platformTargets = {
  darwin: {
    outputDir: path.join(packageRoot, 'bin', 'darwin'),
    outputName: 'rdp-helper',
    binaryPath: path.join(packageRoot, 'bin', 'darwin', 'rdp-helper'),
  },
  linux: {
    outputDir: path.join(packageRoot, 'bin', 'linux'),
    outputName: 'rdp-helper',
    binaryPath: path.join(packageRoot, 'bin', 'linux', 'rdp-helper'),
  },
  win32: {
    outputDir: path.join(packageRoot, 'bin', 'win32'),
    outputName: 'rdp-helper',
    binaryPath: path.join(packageRoot, 'bin', 'win32', 'rdp-helper.exe'),
  },
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

try {
  const target = platformTargets[process.platform];
  if (!target) {
    console.warn(
      `[build:native] Skipping @midscene/rdp helper build on unsupported platform ${process.platform}`,
    );
    process.exit(0);
  }

  mkdirSync(target.outputDir, { recursive: true });
  mkdirSync(buildRoot, { recursive: true });

  const buildDir = path.join(buildRoot, process.platform);
  mkdirSync(buildDir, { recursive: true });

  const configureArgs = [
    '-S',
    nativeRoot,
    '-B',
    buildDir,
    `-DRDP_HELPER_OUTPUT_DIR=${target.outputDir}`,
    `-DRDP_HELPER_OUTPUT_NAME=${target.outputName}`,
  ];

  if (process.platform === 'win32') {
    configureArgs.push('-DCMAKE_BUILD_TYPE=Release');
  }

  run('cmake', configureArgs);

  const buildArgs = ['--build', buildDir];
  if (process.platform === 'win32') {
    buildArgs.push('--config', 'Release');
  }
  run('cmake', buildArgs);

  if (!existsSync(target.binaryPath)) {
    throw new Error(
      `Expected helper binary at ${path.relative(packageRoot, target.binaryPath)}`,
    );
  }

  console.log(
    `[build:native] Built ${path.relative(packageRoot, target.binaryPath)}`,
  );
} catch (error) {
  console.error(
    `[build:native] Failed to build @midscene/rdp helper: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
