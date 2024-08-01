import { defineConfig } from 'vitest/config';
import path from 'path';

const enableTest = process.env.AITEST;

const aiModelTest = enableTest !== 'true' ? ['tests/puppeteer/bing.test.ts']: [];

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['./tests/**/*.test.ts'],
    exclude: [...aiModelTest]
  },
});
