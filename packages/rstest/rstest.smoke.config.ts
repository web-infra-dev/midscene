import { defineConfig } from '@rstest/core';

// Browser-launching smoke tests for the provider fixture wiring (no AI).
// Kept out of the default unit-test config so `nx test` stays browser-free.
export default defineConfig({
  include: ['tests/smoke/**/*.test.ts'],
  testTimeout: 120_000,
});
