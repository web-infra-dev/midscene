import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';

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
      syntax: 'es2021',
    },
    {
      bundle: false,
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      format: 'esm',
      syntax: 'es2021',
      // render.ts (template lookup) and config.ts (config discovery) use
      // __dirname/__filename; without the shims the .mjs build throws
      // ReferenceError at runtime.
      shims: {
        esm: {
          __dirname: true,
          __filename: true,
        },
      },
      dts: {
        distPath: 'dist/types',
      },
    },
  ],
  source: {
    tsconfigPath: 'tsconfig.build.json',
  },
  output: {
    sourceMap: true,
  },
  plugins: [createTypeCheckPlugin()],
  performance: {
    buildCache: false,
  },
});
