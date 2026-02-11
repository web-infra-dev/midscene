import { defineConfig } from '@rslib/core';
import { version } from './package.json';

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
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
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
      bin: './src/bin.ts',
      cli: './src/cli.ts',
      'mcp-server': './src/mcp-server.ts',
    },
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
});
