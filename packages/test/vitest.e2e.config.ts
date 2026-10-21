import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['tests/e2e/**/*.live.test.ts'],
    testTimeout: 60_000,
  },
});
