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

const enableAiTest = false && Boolean(process.env.AITEST);
const baseTests = ['tests/unit-test/*.test.ts'];

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: enableAiTest ? ['tests/ai/**/*.test.ts', ...baseTests] : baseTests,
  },
});
