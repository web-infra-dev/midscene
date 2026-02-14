import { defineConfig } from '@rslib/core';
import { version } from './package.json';

export default defineConfig({
  lib: [
    {
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      format: 'cjs',
      // disable default shims for import.meta.url
      shims: {
        cjs: {
          'import.meta.url': false,
        },
      },
      // use define to make yargs work correctly
      source: {
        define: {
          'import.meta.url': JSON.stringify({}),
        },
      },
      syntax: 'es2020',
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      format: 'esm',
      syntax: 'es2020',
      dts: {
        bundle: true,
        distPath: 'dist/types',
      },
    },
  ],
  source: {
    entry: {
      index: 'src/index.ts',
      'ts-runner/runner': 'src/ts-runner/runner.ts',
      'ts-runner/index': 'src/ts-runner/index.ts',
    },
    define: {
      __VERSION__: JSON.stringify(version),
    },
    tsconfigPath: 'tsconfig.build.json',
  },
  output: {
    externals: ['node:buffer'],
    sourceMap: true,
  },
});
