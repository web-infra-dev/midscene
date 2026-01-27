import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';
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
const aiComputerTests = ['tests/ai/**/*.test.ts'];

const testFiles = (() => {
  switch (aiTestType) {
    case 'computer':
      return [...aiComputerTests];
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
  test: {
    include: testFiles,
    testTimeout: 3 * 60 * 1000, // Global timeout set to 3 minutes
    retry: process.env.CI ? 1 : 0,
    dangerouslyIgnoreUnhandledErrors: !!process.env.CI,
    fileParallelism: false, // disable parallel file test for desktop automation
    globals: true,
    environment: 'node',
  },
  define: {
    __VERSION__: `'${version}'`,
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
