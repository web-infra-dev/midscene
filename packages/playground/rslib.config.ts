import { defineConfig, type rsbuild } from '@rslib/core';
import { version } from './package.json';

export default defineConfig({
  lib: [
    {
      bundle: false,
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      bundle: false,
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      format: 'esm',
      syntax: 'es2020',
      dts: {
        distPath: 'dist/types',
      },
    },
  ],
  source: {
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
  output: {
    sourceMap: true,
  },
});
