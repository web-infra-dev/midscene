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

const testFiles = ['tests/ai/web/**/*.test.ts', 'tests/ai/bridge/**/*.test.ts'];

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: testFiles,
    testTimeout: 3 * 60 * 1000, // Global timeout set to 10 seconds
    dangerouslyIgnoreUnhandledErrors: !!process.env.CI, // showcase.test.ts is not stable
  },
  define: {
    __VERSION__: `'${version}'`,
  },
});
