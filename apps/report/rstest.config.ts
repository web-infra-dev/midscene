import path from 'node:path';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  coverage: createCoverageConfig(__dirname),
  testEnvironment: 'node',
  include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  ...stubStyleRules,
});
