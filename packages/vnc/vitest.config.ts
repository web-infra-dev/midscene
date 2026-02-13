import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';
import { version } from './package.json';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const aiTestType = process.env.AI_TEST_TYPE;
const unitTests = ['tests/unit-test/**/*.test.ts'];
const aiVncTests = ['tests/ai/**/*.test.ts'];

const testFiles = (() => {
  switch (aiTestType) {
    case 'vnc':
      return [...aiVncTests];
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
    testTimeout: 3 * 60 * 1000,
    retry: process.env.CI ? 1 : 0,
    dangerouslyIgnoreUnhandledErrors: !!process.env.CI,
    fileParallelism: false,
    globals: true,
    environment: 'node',
  },
  define: {
    __VERSION__: `'${version}'`,
  },
});
