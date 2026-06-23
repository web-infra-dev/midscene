import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';

export default defineConfig({
  lib: [
    {
      output: { distPath: { root: 'dist/lib' } },
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      output: { distPath: { root: 'dist/es' } },
      dts: {
        bundle: true,
        distPath: 'dist/types',
      },
      format: 'esm',
      syntax: 'es2020',
    },
  ],
  source: {
    tsconfigPath: 'tsconfig.build.json',
    entry: {
      index: './src/index.ts',
    },
  },
  plugins: [createTypeCheckPlugin()],
});
