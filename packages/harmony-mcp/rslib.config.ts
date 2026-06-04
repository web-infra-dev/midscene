import { injectReportHtmlFromCore } from '@midscene/shared/mcp';
import { defineConfig } from '@rslib/core';
import { rspack } from '@rspack/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

export default defineConfig({
  source: {
    tsconfigPath: 'tsconfig.build.json',
    define: {
      __VERSION__: `'${version}'`,
    },
    entry: {
      index: './src/index.ts',
    },
  },
  output: {
    externals: [
      // Keep the image libraries external. Bundling photon-node rewrites its
      // `readFileSync(__dirname, 'photon_rs_bg.wasm')` to the dist dir, where
      // the .wasm is never emitted, so the WASM module fails to initialize
      // ("Cannot read properties of undefined (reading '__wbindgen_malloc')").
      // Resolving from node_modules keeps the asset next to the module.
      '@silvia-odwyer/photon',
      '@silvia-odwyer/photon-node',
      '@modelcontextprotocol/sdk',
    ],
  },
  plugins: [createTypeCheckPlugin(), injectReportHtmlFromCore(__dirname)],
  tools: {
    rspack: {
      output: {
        publicPath: '/',
      },
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
