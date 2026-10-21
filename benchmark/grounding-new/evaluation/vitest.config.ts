import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['evaluation.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
  },
});
