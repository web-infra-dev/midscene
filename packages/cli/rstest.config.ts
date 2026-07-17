import path from 'node:path';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { photonExternal } from '../../scripts/rstest-shared';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  include: enableAiTest ? ['tests/ai/**/*.test.ts'] : basicTest,
  testTimeout: 3 * 60 * 1000, // Global timeout set to 3 minutes
  retry: process.env.CI ? 1 : 0,
  output: {
    externals: photonExternal,
  },
});
