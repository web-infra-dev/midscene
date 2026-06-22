import path from 'node:path';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];
const include = enableAiTest
  ? ['tests/ai/**/*.test.ts', ...basicTest]
  : basicTest;

const sharedAlias = {
  '@': path.resolve(__dirname, 'src'),
};

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  resolve: { alias: sharedAlias },
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
  // Default to node; jsdom is selected per file via the `@vitest-environment
  // jsdom` docblock (the two locator-svg suites). No dotenv globalSetup here:
  // shared has no model-backed AI tests, and a node-only dotenv setup crashes
  // the jsdom environment worker.
  testEnvironment: 'node',
  include,
});
