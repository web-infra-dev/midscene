import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // include: ['tests/inspector/*.test.ts'],
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
