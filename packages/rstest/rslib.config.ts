import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';

export default defineConfig({
  lib: [
    {
      source: {
        entry: {
          playwright: './src/playwright.ts',
          reporter: './src/reporter.ts',
        },
      },
      format: 'esm',
      syntax: 'es2022',
      dts: { bundle: false },
    },
  ],
  output: {
    target: 'node',
    sourceMap: true,
  },
  plugins: [createTypeCheckPlugin()],
});
