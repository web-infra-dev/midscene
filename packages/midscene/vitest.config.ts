import path from 'node:path';
//@ts-ignore
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

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  test: {
    pool: 'forks',
    include: enableAiTest
      ? ['tests/ai/**/**.test.ts', ...basicTest]
      : basicTest,
    exclude: process.env.TEST_COMPUTER
      ? []
      : ['tests/ai/evaluate/computer.test.ts'],
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
