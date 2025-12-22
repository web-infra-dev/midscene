import { injectReportHtmlFromCore } from '@midscene/shared/mcp';
import { defineConfig } from '@rslib/core';
import { rspack } from '@rspack/core';
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
      '@modelcontextprotocol/sdk',
      'playwright',
      'playwright-core',
    ],
  },
  plugins: [injectReportHtmlFromCore(__dirname)],
  tools: {
    rspack: {
      plugins: [
        new rspack.BannerPlugin({
          banner: '#!/usr/bin/env node',
          raw: true,
          test: /^index\.js$/,
        }),
      ],
      optimization: {
        minimize: false,
      },
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
});
