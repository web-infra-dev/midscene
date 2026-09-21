import path from 'node:path';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { photonExternal } from '../../scripts/rstest-shared';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const enableAiTest = Boolean(process.env.AITEST);
const enableCliE2eTest = Boolean(process.env.CLI_E2E);
const basicTest = ['tests/unit-test/**/*.test.ts'];
const include = enableAiTest
  ? ['tests/ai/**/*.test.ts']
  : enableCliE2eTest
    ? ['tests/e2e/**/*.test.ts']
    : basicTest;

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  include,
  testTimeout: 3 * 60 * 1000, // Global timeout set to 3 minutes
  retry: enableCliE2eTest ? 0 : process.env.CI ? 1 : 0,
  ...(enableCliE2eTest
    ? { pool: { maxWorkers: 1 } }
    : enableAiTest && process.env.CI
      ? { pool: { maxWorkers: 4 } }
      : {}),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  output: {
    externals: photonExternal,
  },
});
