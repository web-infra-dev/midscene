import path from 'node:path';
//@ts-ignore
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const enableTest = process.env.AITEST;

const aiModelTest =
  enableTest === 'true' || enableTest === '1'
    ? []
    : ['tests/ai-model/**/*.test.ts', 'tests/automation/planning.test.ts'];

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // include: ['tests/ai-model/**/*-coze.test.ts'],
    // Need to improve the corresponding testing
    exclude: [
      'tests/insight/*.test.ts',
      'tests/executor/*.test.ts',
      ...aiModelTest,
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
