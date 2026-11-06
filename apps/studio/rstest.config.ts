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
  testEnvironment: 'node',
  include: ['tests/**/*.test.{mjs,ts,tsx}'],
});

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  projects: [
    {
      ...sharedConfig,
      name: 'studio',
      exclude: ['tests/updater-handlers.test.ts'],
    },
    {
      ...sharedConfig,
      name: 'updater-handlers',
      include: ['tests/updater-handlers.test.ts'],
      // Keep its CJS export getters inside the mock graph without changing
      // Rstest's default dependency bundling for jsdom tests.
      output: {
        externals: photonExternal,
        bundleDependencies: ['electron-updater'],
      },
    },
  ],
});
