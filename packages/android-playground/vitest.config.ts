import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  resolve: {
    alias: {
      '@midscene/android': path.resolve(__dirname, '../android/src/index.ts'),
      '@midscene/core/internal/device-cache': path.resolve(
        __dirname,
        '../core/src/device-cache',
      ),
    },
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
  test: {
    coverage: createCoverageConfig(__dirname),
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
