import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  test: {
    coverage: createCoverageConfig(__dirname),
    include: enableAiTest ? ['tests/ai/**/*.test.ts'] : basicTest,
    testTimeout: 3 * 60 * 1000, // Global timeout set to 3 minutes
    retry: process.env.CI ? 1 : 0,
    // Keep CI model request concurrency comparable to the former 4-core hosted
    // runner. Set here (CI-only) instead of as CLI flags in ai-unit-test.yml
    // because rstest rejects bare --minWorkers/--maxWorkers. Local AI runs
    // keep the default worker count.
    ...(enableAiTest && process.env.CI ? { minWorkers: 1, maxWorkers: 4 } : {}),
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
