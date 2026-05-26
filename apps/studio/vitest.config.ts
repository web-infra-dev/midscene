import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    coverage: createCoverageConfig(__dirname),
    environment: 'node',
    environmentMatchGlobs: [['tests/theme-provider.test.ts', 'jsdom']],
    include: ['tests/**/*.test.{mjs,ts,tsx}'],
  },
});
