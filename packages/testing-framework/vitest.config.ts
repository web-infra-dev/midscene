import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Read environment variables from the repo root .env (if present).
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Let tests import the example authoring files (which use the package
      // name) without requiring a dist build.
      '@midscene/testing-framework': path.resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    include: ['tests/unit-test/**/*.test.ts'],
    testTimeout: 30 * 1000,
  },
});
