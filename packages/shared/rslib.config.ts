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
      format: 'cjs',
      syntax: 'es2020',
      bundle: false,
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      format: 'esm',
      syntax: 'es2020',
      bundle: false,
      dts: true,
    },
  ],
  source: {
    define: {
      __HTML_ELEMENT_SCRIPT__: JSON.stringify(scriptStr),
    },
  },
});
