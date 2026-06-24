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
const aiComputerTests = ['tests/ai/*.test.ts'];
const aiComputerRdpTests = ['tests/ai/rdp/**/*.test.ts'];

const testFiles = (() => {
  switch (aiTestType) {
    case 'computer':
      return [...aiComputerTests];
    case 'computer-rdp':
      return [...aiComputerRdpTests];
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
  hookTimeout: 3 * 60 * 1000,
  retry: process.env.CI ? 1 : 0,
  errors: process.env.CI ? { unhandled: false } : undefined,
  pool: { maxWorkers: 1 }, // disable parallel file test for desktop automation
  globals: true,
  testEnvironment: 'node',
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
});
