import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
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
    tsconfigPath: 'tsconfig.build.json',
    entry: {
      index: './src/index.ts',
      cli: './src/cli.ts',
    },
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
  output: {
    // Pi and the platform UI agents are heavy runtime deps; keep them external.
    externals: [
      '@earendil-works/pi-coding-agent',
      '@earendil-works/pi-ai',
      '@midscene/web',
      '@midscene/web/puppeteer-agent-launcher',
    ],
  },
  plugins: [createTypeCheckPlugin()],
});
