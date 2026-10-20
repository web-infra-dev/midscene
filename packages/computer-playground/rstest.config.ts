import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  testEnvironment: 'node',
  include: ['tests/**/*.test.ts'],
});
