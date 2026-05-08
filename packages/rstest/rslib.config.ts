import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      source: {
        entry: {
          index: './src/index.ts',
          reporter: './src/reporter.ts',
          playwright: './src/playwright.ts',
          puppeteer: './src/puppeteer.ts',
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
