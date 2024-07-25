import { defineConfig } from 'vitest/config';
import path from 'path';

const aiModelTest = process.env.GITHUB_ACTIONS === 'true'? ['tests/inspector/*.test.ts']: [];

export default defineConfig({
  test: {
    // include: ['tests/inspector/*.test.ts'],
    include: ['tests/**/*.test.ts'],
    // Need to improve the corresponding testing
    exclude: ['tests/insight/*.test.ts', 'tests/automation/planning.test.ts', ...aiModelTest]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
