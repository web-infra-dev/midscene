import { defineConfig } from '@rslib/core';
import { version } from './package.json';

export default defineConfig({
  source: {
    define: {
      __VERSION__: `'${version}'`,
    },
    entry: {
      index: './src/index.ts',
      server: './src/server.ts',
    },
  },
  output: {
    externals: ['@midscene/web-mcp'],
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
