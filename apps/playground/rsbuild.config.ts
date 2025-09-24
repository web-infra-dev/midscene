import path from 'node:path';
import { createPlaygroundCopyPlugin } from '@midscene/shared';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { version as playgroundVersion } from '../../packages/playground/package.json';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginNodePolyfill(),
    pluginSvgr(),
    createPlaygroundCopyPlugin(
      path.join(__dirname, 'dist'),
      path.join(__dirname, '../../packages/playground/static'),
      'copy-playground-static',
      path.join(__dirname, 'src', 'favicon.ico'),
    ),
    createPlaygroundCopyPlugin(
      path.join(__dirname, 'dist'),
      path.join(__dirname, '../../packages/ios/static'),
      'copy-ios-playground-static',
      path.join(__dirname, 'src', 'favicon.ico'),
    ),
    pluginTypeCheck(),
  ],
  resolve: {
    alias: {
      // Polyfill Node.js modules for browser environment
      async_hooks: path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
      'node:async_hooks': path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
    },
  },
  html: {
    title: 'Midscene Playground',
    favicon: './src/favicon.ico',
  },
  source: {
    entry: {
      index: './src/index.tsx',
    },
    define: {
      __APP_VERSION__: JSON.stringify(playgroundVersion),
      __SERVER_URL__: JSON.stringify(process.env.__SERVER_URL__ || ''),
    },
  },
  output: {
    distPath: {
      root: 'dist',
    },
    sourceMap: true,
    externals: ['sharp'],
  },
});
