import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';

export default defineConfig({
  root: __dirname,
  coverage: createCoverageConfig(__dirname),
  include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
});
