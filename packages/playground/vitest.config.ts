import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    environmentOptions: {
      env: {
        NODE_ENV: 'test',
      },
    },
    coverage: createCoverageConfig(__dirname),
  },
});
