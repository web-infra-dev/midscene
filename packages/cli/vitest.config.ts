import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';
import {
  hasAiModelConfig,
  logSkippedAiTests,
} from '../../scripts/ai-test-config';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];
const runAiTests = enableAiTest && hasAiModelConfig();

if (enableAiTest && !runAiTests) {
  logSkippedAiTests('cli-vitest');
}

export default defineConfig({
  test: {
    include: enableAiTest
      ? runAiTests
        ? ['tests/ai/**/*.test.ts']
        : []
      : basicTest,
    passWithNoTests: enableAiTest && !runAiTests,
    testTimeout: 3 * 60 * 1000, // Global timeout set to 3 minutes
    retry: process.env.CI ? 1 : 0,
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
