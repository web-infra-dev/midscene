import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/theme-provider.test.ts', 'jsdom']],
    include: ['tests/**/*.test.mjs', 'tests/**/*.test.ts'],
  },
});
