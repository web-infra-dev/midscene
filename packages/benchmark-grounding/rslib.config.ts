import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: 'es2020',
      dts: { bundle: true, distPath: 'dist/types' },
    },
  ],
  source: {
    entry: {
      index: './src/index.ts',
      'presets/index': './src/presets/index.ts',
      'cli/index': './cli/index.ts',
    },
    tsconfigPath: './tsconfig.build.json',
  },
  output: {
    distPath: { root: 'dist' },
    copy: [
      {
        from: './node_modules/.cache/benchmark-grounding-ui/index.html',
        to: 'ui-template.html',
      },
    ],
    filename: { js: '[name].mjs' },
    sourceMap: false,
    externals: ['@midscene/benchmark-grounding'],
  },
});
