import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  test: {
    coverage: createCoverageConfig(__dirname),
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
