import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  name: '@midscene/benchmark-grounding',
  include: ['tests/**/*.test.ts'],
  testTimeout: 15000,
  source: {
    define: {
      'import.meta.url': JSON.stringify(
        new URL('./src/index.ts', import.meta.url).href,
      ),
    },
  },
  resolve: {
    alias: {
      '@midscene/benchmark-grounding': fileURLToPath(
        new URL('./src/index.ts', import.meta.url),
      ),
    },
  },
  output: {
    externals: [
      '@midscene/core',
      '@midscene/shared/img',
      '@midscene/shared/env',
      '@midscene/shared/logger',
    ],
  },
});
