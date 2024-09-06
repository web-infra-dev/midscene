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

const aiTestType = process.env.AI_TEST_TYPE;
const unitTests = ['tests/unit-test/*.test.ts'];
const aiWebTests = ['tests/ai/web/**/*.test.ts'];
const aiNativeTests = ['tests/ai/native/**/*.test.ts'];

const testFiles = (() => {
  switch (aiTestType) {
    case 'web':
      return [...unitTests, ...aiWebTests];
    case 'native':
      return [...unitTests, ...aiNativeTests];
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
  },
});
