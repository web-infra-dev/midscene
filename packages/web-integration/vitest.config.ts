import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: testFiles,
    testTimeout: 3 * 60 * 1000, // Global timeout set to 3 minutes
    dangerouslyIgnoreUnhandledErrors: !!process.env.CI, // showcase.test.ts is not stable
  },
  define: {
    // must greater than 0.16.0, otherwise will cause warning "You are using an old version of Midscene cache file"
    __VERSION__: `'0.999.0'`,
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
