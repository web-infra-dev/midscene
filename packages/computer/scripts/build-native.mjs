#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(packageRoot, '.native-build');

const rdpPlatformTargets = {
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

function buildPhasedScroll() {
  if (process.platform !== 'darwin') {
    console.warn(
      `[build:native] Skipping phased-scroll build on unsupported platform ${process.platform}`,
    );
    return;
  }

  const outputDir = path.join(packageRoot, 'bin', 'darwin');
  const outputPath = path.join(outputDir, 'phased-scroll');
  mkdirSync(outputDir, { recursive: true });

  run('clang', [
    '-O2',
    '-arch',
    'arm64',
    '-arch',
    'x86_64',
    '-framework',
    'ApplicationServices',
    '-o',
    outputPath,
    path.join(packageRoot, 'native', 'phased-scroll.m'),
  ]);

  if (!existsSync(outputPath)) {
    throw new Error(
      `Expected phased-scroll helper at ${path.relative(packageRoot, outputPath)}`,
    );
  }

  console.log(`[build:native] Built ${path.relative(packageRoot, outputPath)}`);
}

function buildRdpHelper() {
  const target = rdpPlatformTargets[process.platform];
  if (!target) {
    console.warn(
      `[build:native] Skipping RDP helper build on unsupported platform ${process.platform}`,
    );
    return;
  }

  const nativeRoot = path.join(packageRoot, 'native', 'rdp');
  const buildDir = path.join(buildRoot, 'rdp', process.platform);

  mkdirSync(target.outputDir, { recursive: true });
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
      `Expected RDP helper at ${path.relative(packageRoot, target.binaryPath)}`,
    );
  }

  console.log(
    `[build:native] Built ${path.relative(packageRoot, target.binaryPath)}`,
  );
}

try {
  mkdirSync(buildRoot, { recursive: true });
  buildPhasedScroll();
  buildRdpHelper();
} catch (error) {
  console.error(
    `[build:native] Failed to build @midscene/computer native helpers: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
