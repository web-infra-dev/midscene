import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify('1.2.3-test'),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30 * 1000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
