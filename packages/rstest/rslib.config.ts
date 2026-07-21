import { defineConfig } from '@rslib/core';

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
});
