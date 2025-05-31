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
          'record-iife': './src/record-iife-index.ts',
        },
      },
    },
  ],
  output: {
    target: 'web',
  },
  plugins: [pluginReact()],
});
