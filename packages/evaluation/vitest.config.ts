import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
  override: true,
  debug: true,
});

export default defineConfig({
  test: {
    include: ['tests/**.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
