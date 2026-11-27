import path from 'node:path';
import { defineConfig } from '@rstest/core';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

export default defineConfig({
  name: '@midscene/connect',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  include: ['tests/unit/**/*.test.ts'],
  testTimeout: 30 * 1000,
  source: {
    define: defineVersion(version),
  },
  output: {
    externals: photonExternal,
  },
});
