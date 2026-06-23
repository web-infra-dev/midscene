import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  test: {
    coverage: createCoverageConfig(__dirname),
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
