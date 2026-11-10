import path from 'node:path';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { photonExternal } from '../../scripts/rstest-shared';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

const sharedConfig = defineConfig({
  output: { externals: photonExternal },
  tools: {
    ...stubStyleRules.tools,
    swc: { jsc: { transform: { react: { runtime: 'automatic' } } } },
  },
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@midscene/playground/recorder-ui-describer$': path.resolve(
        __dirname,
        '../../packages/playground/src/recorder-ui-describer.ts',
      ),
      '@silvia-odwyer/photon': path.resolve(
        __dirname,
        'tests/fixtures/photon.ts',
      ),
    },
  },
  // Let jsdom own browser storage instead of Node's native implementation.
  pool: {
    execArgv: process.allowedNodeEnvironmentFlags.has(
      '--no-experimental-webstorage',
    )
      ? ['--no-experimental-webstorage']
      : [],
  },
  testEnvironment: 'node',
  include: ['tests/**/*.test.{mjs,ts,tsx}'],
});

// CI installs dependencies with --ignore-scripts, so Electron has no binary.
// These tests mock Electron; bundle it so Rstest does not evaluate the external
// package (and require its binary) before applying those mocks.
const electronMockTests = [
  'tests/platform-sidecar-process.test.ts',
  'tests/preload-bridge.test.ts',
  'tests/scrcpy-sidecar-process.test.ts',
  'tests/updater-handlers.test.ts',
];

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  projects: [
    {
      ...sharedConfig,
      name: 'studio',
      exclude: electronMockTests,
    },
    {
      ...sharedConfig,
      name: 'electron-mocks',
      include: electronMockTests,
      // Keep CJS initialization inside the mock graph without changing
      // Rstest's default dependency bundling for jsdom tests.
      output: {
        externals: photonExternal,
        bundleDependencies: ['electron', 'electron-updater'],
      },
    },
  ],
});
