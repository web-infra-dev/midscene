import { defineConfig } from '@rslib/core';
import { version } from './package.json';

export default defineConfig({
  lib: [
    {
      output: {
        distPath: { root: 'dist/lib' },
        // Keep as external so it's loaded at runtime
        // This allows try-catch to properly handle missing optional dependency
        externals: ['node-mac-permissions'],
      },
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      output: {
        distPath: { root: 'dist/es' },
        // Keep as external so it's loaded at runtime
        // This allows try-catch to properly handle missing optional dependency
        externals: ['node-mac-permissions'],
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
      cli: './src/cli.ts',
      'mcp-server': './src/mcp-server.ts',
    },
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
});
