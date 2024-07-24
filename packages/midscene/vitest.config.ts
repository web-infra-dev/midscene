import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // include: ['tests/inspector/*.test.ts'],
    include: ['tests/**/*.test.ts'],
    // Need to improve the corresponding testing
    exclude: ['tests/insight/*.test.ts', 'tests/automation/planning.test.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
