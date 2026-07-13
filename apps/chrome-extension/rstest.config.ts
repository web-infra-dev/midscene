import path from 'node:path';
import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

export default defineConfig({
  plugins: [pluginReact()],
  coverage: createCoverageConfig(__dirname),
  // Default to node; jsdom is selected per file via the `@vitest-environment
  // jsdom` docblock. The storage polyfill is harmless under node, so it can be
  // applied globally.
  testEnvironment: 'node',
  setupFiles: [
    path.resolve(__dirname, '../../scripts/rstest-jsdom-storage.ts'),
  ],
  include: ['tests/**/*.test.{ts,tsx}'],
  ...stubStyleRules,
});
