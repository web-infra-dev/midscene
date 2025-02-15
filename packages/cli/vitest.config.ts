import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // bridge test is not supported in cli
    // exclude: ['tests/bridge.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
