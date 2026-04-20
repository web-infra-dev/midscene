import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const aiTestType = process.env.AI_TEST_TYPE;
const unitTests = ['tests/unit-test/**/*.test.ts'];
const aiRdpTests = ['tests/ai/**/*.test.ts'];

const testFiles = (() => {
  switch (aiTestType) {
    case 'rdp':
      return [...aiRdpTests];
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
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
  test: {
    include: testFiles,
    testTimeout: 3 * 60 * 1000,
    hookTimeout: 3 * 60 * 1000,
    retry: process.env.CI ? 1 : 0,
    fileParallelism: aiTestType !== 'rdp',
    globals: true,
    environment: 'node',
  },
});
