import path from 'node:path';
//@ts-ignore
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

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
