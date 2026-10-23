import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

export default defineConfig({
  output: { externals: ['@midscene/ios'] },
  lib: [
    {
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      dts: {
        // Share class declarations across the root and /test entry points.
        bundle: false,
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
      bin: './src/bin.ts',
      cli: './src/cli.ts',
      'test-runner': './src/test-runner.ts',
    },
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
  plugins: [createTypeCheckPlugin()],
});
