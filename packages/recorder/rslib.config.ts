import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      bundle: false,
      dts: true,
      format: 'esm',
      source: {
        entry: {
          index: './src/**',
        },
      },
    },
    {
      format: 'iife',
      dts: false,
      source: {
        entry: {
          'recorder-iife': './src/recorder-iife-index.ts',
        },
      },
      resolve: {
        alias: {
          '@midscene/shared/extractor': '../shared/src/extractor/index.ts',
        },
      },
    },
  ],
  // externals: ['@midscene/shared'],
  output: {
    target: 'web',
  },
  plugins: [pluginReact()],
});
