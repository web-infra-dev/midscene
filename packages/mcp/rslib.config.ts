import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { createCoreReportTemplateReplacementPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

export default defineConfig({
  source: {
    tsconfigPath: 'tsconfig.build.json',
    define: {
      __VERSION__: `'${version}'`,
    },
    entry: {
      index: './src/index.ts',
      server: './src/server.ts',
    },
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
  plugins: [
    createTypeCheckPlugin(),
    createCoreReportTemplateReplacementPlugin({ appDir: __dirname }),
  ],
});
