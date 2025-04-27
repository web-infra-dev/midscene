import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { version } from './package.json';
export default defineConfig({
  source: {
    define: {
      __VERSION__: `'${version}'`,
    },
    entry: {
      index: './src/index.ts',
    },
  },
  output: {
    copy: [
      {
        from: path.join(__dirname, '../../apps/site/docs/en/guide/api/API.mdx'),
      },
      { from: path.join(__dirname, './src/playwright-example.txt') },
    ],
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2021',
      dts: true,
    },
    {
      format: 'cjs',
      syntax: 'es2021',
    },
  ],
});
