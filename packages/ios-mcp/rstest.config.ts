import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  globals: true,
  testEnvironment: 'node',
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
});
