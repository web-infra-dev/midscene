import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    coverage: createCoverageConfig(__dirname),
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
