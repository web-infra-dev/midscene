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

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  test: {
    include: enableAiTest
      ? ['tests/ai/inspector/todo_inspector.test.ts', ...basicTest]
      : basicTest,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
