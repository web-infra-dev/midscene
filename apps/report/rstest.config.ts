import path from 'node:path';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';

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
});
