import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      autoExtension: false,
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      autoExtension: false,
      dts: {
        bundle: true,
        distPath: 'dist/types',
      },
      format: 'esm',
      syntax: 'es2020',
    },
  ],
  source: {
    entry: {
      index: './src/index.ts',
    },
  },
});
