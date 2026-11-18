import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

const cliEntries = {
  index: 'src/index.ts',
  'framework/index': 'src/framework/index.ts',
};

export default defineConfig({
  lib: [
    {
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      format: 'cjs',
      // disable default shims for import.meta.url
      shims: {
        cjs: {
          'import.meta.url': false,
        },
      },
      // use define to make yargs work correctly
      source: {
        entry: cliEntries,
        define: {
          'import.meta.url': JSON.stringify({}),
        },
      },
      syntax: 'es2020',
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      format: 'esm',
      syntax: 'es2020',
      shims: { esm: { require: true, __dirname: true } },
      source: { entry: cliEntries },
      dts: {
        bundle: true,
        distPath: 'dist/types',
      },
    },
    {
      id: 'benchmark-grounding',
      format: 'esm',
      syntax: 'es2020',
      source: {
        entry: { index: 'src/benchmark-grounding/index.ts' },
      },
      output: {
        distPath: { root: 'dist/benchmark-grounding' },
        filename: { js: '[name].mjs' },
        copy: [
          {
            from: 'node_modules/.cache/benchmark-grounding-ui/index.html',
            to: 'ui-template.html',
          },
        ],
      },
    },
  ],
  source: {
    define: {
      __VERSION__: JSON.stringify(version),
    },
    tsconfigPath: 'tsconfig.build.json',
  },
  output: {
    externals: [
      'node:buffer',
      // Both Node outputs load the same ESM bundle through native import().
      { './benchmark-grounding': 'import ../benchmark-grounding/index.mjs' },
    ],
    sourceMap: true,
  },
  plugins: [createTypeCheckPlugin()],
});
