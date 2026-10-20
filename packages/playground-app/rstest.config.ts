import path from 'node:path';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

export default defineConfig({
  resolve: {
    alias: {
      '@midscene/shared/constants': path.resolve(
        __dirname,
        '../shared/src/constants/index.ts',
      ),
    },
  },
  coverage: createCoverageConfig(__dirname),
  testEnvironment: 'node',
  include: ['tests/**/*.test.ts'],
  ...stubStyleRules,
});
