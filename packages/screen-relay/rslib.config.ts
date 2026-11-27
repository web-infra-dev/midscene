import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

export default defineConfig({
  lib: [
    {
      source: {
        entry: {
          index: './src/index.ts',
        },
      },
      output: {
        distPath: { root: 'dist/lib' },
      },
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      source: {
        entry: {
          index: './src/index.ts',
          cli: './src/cli.ts',
        },
      },
      output: {
        distPath: { root: 'dist/es' },
      },
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
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
  plugins: [createTypeCheckPlugin()],
});
