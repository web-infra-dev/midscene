import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  resolve: {
    alias: {
      '@midscene/shared/constants': path.resolve(
        __dirname,
        '../shared/src/constants/index.ts',
      ),
    },
  },
  test: {
    coverage: createCoverageConfig(__dirname),
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
