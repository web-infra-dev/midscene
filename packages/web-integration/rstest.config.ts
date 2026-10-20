import path from 'node:path';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const aiTestType = process.env.AI_TEST_TYPE;
const unitTests = ['tests/unit-test/**/*.test.ts'];
const aiWebTests = [
  'tests/ai/web/**/*.test.ts',
  'tests/ai/bridge/**/*.test.ts',
];

const testFiles = (() => {
  switch (aiTestType) {
    case 'web':
      return [...aiWebTests];
    default:
      return unitTests;
  }
})();

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  include: testFiles,
  testTimeout: 3 * 60 * 1000, // Global timeout set to 3 minutes
  retry: process.env.CI ? 1 : 0, // Retry failed tests once in CI to handle AI flakiness
  ...(aiTestType === 'web' && process.env.CI
    ? { pool: { maxWorkers: 4 } }
    : {}),
  reporters: process.env.CI
    ? ['verbose', ['json', { outputPath: './test-results.json' }]]
    : ['default'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  source: {
    // must greater than 0.16.0, otherwise will cause warning "You are using an old version of Midscene cache file"
    define: defineVersion('0.999.0'),
  },
  output: {
    externals: photonExternal,
  },
});
