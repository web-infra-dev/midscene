import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  include: ['tests/**/*.test.mjs'],
});
