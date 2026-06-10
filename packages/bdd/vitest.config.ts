import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    environmentOptions: {
      env: {
        NODE_ENV: 'test',
      },
    },
    coverage: createCoverageConfig(__dirname),
  },
});
