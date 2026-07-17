import path from 'node:path';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const aiTestType = process.env.AI_TEST_TYPE;
const unitTests = ['tests/unit-test/**/*.test.ts'];
const aiAndroidTests = ['tests/ai/**/*.test.ts'];

const testFiles = (() => {
  switch (aiTestType) {
    case 'android':
      return [...aiAndroidTests];
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
  include: testFiles,
  testTimeout: 3 * 60 * 1000,
  errors: process.env.CI ? { unhandled: false } : undefined, // showcase.test.ts is not stable
  pool: { maxWorkers: 1 }, // disable parallel file test
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
});
