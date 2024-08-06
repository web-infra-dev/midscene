import path from 'node:path';
import { defineConfig } from 'vitest/config';

const enableTest = process.env.AITEST;

const aiModelTest =
  enableTest !== 'true'
    ? ['tests/puppeteer/bing.test.ts', 'tests/puppeteer/showcase.test.ts']
    : [];

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['./tests/**/*.test.ts'],
    exclude: [...aiModelTest],
  },
});
