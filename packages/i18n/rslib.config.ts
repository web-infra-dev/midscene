import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      bundle: false,
      format: 'cjs',
      syntax: 'es6',
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      bundle: false,
      format: 'esm',
      syntax: 'es6',
      dts: {
        distPath: 'dist/types',
      },
    },
  ],
  source: {
    entry: {
      index: ['./src/**'],
    },
  },
  output: {
    target: 'web',
  },
  plugins: [pluginReact()],
});
