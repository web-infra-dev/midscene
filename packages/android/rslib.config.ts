import { defineConfig } from '@rslib/core';

export default defineConfig({
  output: {
    // Keep @ffmpeg-installer/ffmpeg as external so it's loaded at runtime
    // This allows try-catch to properly handle missing optional dependency
    externals: ['@ffmpeg-installer/ffmpeg'],
  },
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
      'mcp-server': './src/mcp-server.ts',
    },
  },
});
