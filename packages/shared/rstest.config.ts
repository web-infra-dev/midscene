import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];
const include = enableAiTest
  ? ['tests/ai/**/*.test.ts', ...basicTest]
  : basicTest;

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
  // No dotenv globalSetup here: shared has no model-backed AI tests, and a
  // node-only dotenv setup crashes the jsdom environment worker used by the two
  // locator-svg suites (they select jsdom via a `@vitest-environment` docblock).
  include,
});
