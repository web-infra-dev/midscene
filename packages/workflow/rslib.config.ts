import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';

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
      'workflow-cli': './src/workflow-cli.ts',
      'cli/index': './src/cli/workflow-project.ts',
      'cli/workflow-rstest-bridge.test':
        './src/cli/workflow-rstest-bridge.test.ts',
    },
    tsconfigPath: 'tsconfig.build.json',
  },
  output: {
    sourceMap: true,
  },
  plugins: [createTypeCheckPlugin()],
});
