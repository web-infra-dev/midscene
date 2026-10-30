import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  name: 'scripts',
  root: fileURLToPath(new URL('.', import.meta.url)),
  include: ['tests/**/*.test.mjs'],
});
