import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['tests/e2e/create-web.live.test.ts'],
  testTimeout: 15 * 60_000,
});
