import { defineConfig } from '@rstest/core';

export default defineConfig({
  name: 'doc',
  output: { bundleDependencies: ['@rspress/core'] },
  include: ['tests/**/*.test.ts'],
});
