import path from 'node:path';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const testFiles =
  process.env.AI_TEST_TYPE === 'screen-relay'
    ? ['tests/ai/**/*.test.ts']
    : ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  name: '@midscene/screen-relay',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  coverage: createCoverageConfig(__dirname),
  include: testFiles,
  testTimeout: 3 * 60 * 1000,
  hookTimeout: 3 * 60 * 1000,
  retry: process.env.CI ? 1 : 0,
  pool: { maxWorkers: 1 },
  testEnvironment: 'node',
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
});
