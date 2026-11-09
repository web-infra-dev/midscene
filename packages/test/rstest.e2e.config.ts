import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['tests/e2e/**/*.test.ts'],
  exclude: ['tests/e2e/**/*.live.test.ts'],
  testTimeout: 60_000,
});
