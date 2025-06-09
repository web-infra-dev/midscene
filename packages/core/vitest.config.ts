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
  override: true,
  debug: true,
});

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  test: {
    include: enableAiTest ? ['tests/ai/**/**.test.ts'] : basicTest,
  },
  define: {
    __VERSION__: `'${version}'`,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
