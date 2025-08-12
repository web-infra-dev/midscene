import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';

const scriptStr = fs.readFileSync(
  path.resolve(__dirname, './dist-inspect/htmlElement.js'),
  'utf-8',
);

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
      img: './src/img/index.ts',
      constants: './src/constants/index.ts',
      extractor: './src/extractor/index.ts',
      'extractor-debug': './src/extractor/debug.ts',
      fs: './src/node/fs.ts',
      utils: './src/utils.ts',
      logger: './src/logger.ts',
      common: './src/common.ts',
      'us-keyboard-layout': './src/us-keyboard-layout.ts',
      env: './src/env.ts',
      types: './src/types/index.ts',
    },
    define: {
      __HTML_ELEMENT_SCRIPT__: JSON.stringify(scriptStr),
    },
  },
});
