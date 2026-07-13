import path from 'node:path';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const aiTestType = process.env.AI_TEST_TYPE;
const unitTests = ['tests/unit-test/**/*.test.ts'];
const aiHarmonyTests = ['tests/ai/**/*.test.ts'];

const testFiles = (() => {
  switch (aiTestType) {
    case 'harmony':
      return [...aiHarmonyTests];
    default:
      return unitTests;
  }
})();

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  coverage: createCoverageConfig(__dirname),
  globalSetup: [
    path.resolve(__dirname, '../../scripts/rstest-dotenv-setup.ts'),
  ],
  include: testFiles,
  testTimeout: 3 * 60 * 1000,
  errors: process.env.CI ? { unhandled: false } : undefined,
  pool: { maxWorkers: 1 },
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
});
