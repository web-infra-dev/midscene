import { defineConfig } from '@rstest/core';

// The smoke suite exercises the real fixture wiring (rstest runtime plus a
// real browser), so it has to run under rstest itself. Unit tests run under
// vitest like every other package — see vitest.config.ts.
export default defineConfig({
  include: ['tests/smoke/**/*.test.ts'],
  testTimeout: 120_000,
});
