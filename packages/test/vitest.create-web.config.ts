import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/create-web.live.test.ts'],
    testTimeout: 15 * 60_000,
  },
});
