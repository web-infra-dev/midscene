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
  override: true,
  debug: true,
});

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  test: {
    coverage: createCoverageConfig(__dirname),
    include: enableAiTest ? ['tests/ai/**/**.test.ts'] : basicTest,
    retry: process.env.CI ? 1 : 0,
  },
  define: {
    __VERSION__: `'${version}'`,
    __DEV_REPORT_PATH__: JSON.stringify(
      path.resolve(__dirname, '../../apps/report/dist/index.html'),
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
