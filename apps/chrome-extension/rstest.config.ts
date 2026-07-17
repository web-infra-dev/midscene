import path from 'node:path';
import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

export default defineConfig({
  plugins: [pluginReact()],
  coverage: createCoverageConfig(__dirname),
  // Only the `@vitest-environment jsdom` docblock files need the storage
  // polyfill, but it is harmless under node, so it is applied globally.
  setupFiles: [
    path.resolve(__dirname, '../../scripts/rstest-jsdom-storage.ts'),
  ],
  include: ['tests/**/*.test.{ts,tsx}'],
  ...stubStyleRules,
});
