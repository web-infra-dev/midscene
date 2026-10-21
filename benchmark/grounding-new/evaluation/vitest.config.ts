import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['evaluation.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
  },
});
