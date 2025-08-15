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
    copy: [{ from: path.join(__dirname, '../../apps/site/docs/en/api.mdx') }],
    externals: [
      (data, cb) => {
        if (
          data.context?.includes('/node_modules/ws/lib') &&
          ['bufferutil', 'utf-8-validate'].includes(data.request as string)
        ) {
          cb(undefined, data.request);
        }
        cb();
      },
      '@silvia-odwyer/photon',
      '@silvia-odwyer/photon-node',
    ],
  },
  lib: [
    {
      format: 'cjs',
      syntax: 'es2021',
      output: {
        distPath: {
          root: 'dist',
        },
      },
    },
  ],
});
