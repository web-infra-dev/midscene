import path from 'node:path';
//@ts-ignore
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config();

const enableTest = process.env.AITEST;

const aiModelTest =
  enableTest !== 'true' ? ['tests/ai-model/**/*.test.ts'] : [];

export default defineConfig({
  test: {
    // include: ['tests/inspector/*.test.ts'],
    include: ['tests/**/*.test.ts'],
    // Need to improve the corresponding testing
    exclude: [
      'tests/insight/*.test.ts',
      'tests/automation/planning.test.ts',
      ...aiModelTest,
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
