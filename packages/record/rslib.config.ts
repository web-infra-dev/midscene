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
    // {
    //   format: 'cjs',
    //   syntax: ['node 18'],
    //   source: {
    //     entry: {
    //       index: './src/index.tsx',
    //     },
    //   },
    // },
    // {
    //   format: 'esm',
    //   syntax: ['node 18'],
    //   dts: true,
    //   source: {
    //     entry: {
    //       index: './src/index.ts',
    //     },
    //   },
    // },
    //
    {
      format: 'iife',
      dts: false,
      source: {
        entry: {
          iife: './src/iife-index.ts',
        },
      },
    },
  ],
  output: {
    target: 'web',
  },
  plugins: [pluginReact()],
});
