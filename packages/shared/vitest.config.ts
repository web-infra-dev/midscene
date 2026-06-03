import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';
import { version } from './package.json';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  test: {
    coverage: createCoverageConfig(__dirname),
    include: enableAiTest ? ['tests/ai/**/*.test.ts', ...basicTest] : basicTest,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __VERSION__: JSON.stringify(version),
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
