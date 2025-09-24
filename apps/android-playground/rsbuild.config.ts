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
  environments: {
    web: {
      source: {
        entry: {
          index: './src/index.tsx',
        },
        define: {
          __APP_VERSION__: JSON.stringify(playgroundVersion),
        },
      },
      output: {
        target: 'web',
        externals: ['sharp'],
        sourceMap: true,
      },
      html: {
        title: 'Midscene Android Playground',
      },
    },
  },
  dev: {
    writeToDisk: true,
  },
  resolve: {
    alias: {
      async_hooks: path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
      'node:async_hooks': path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  output: {
    externals: ['sharp'],
  },
  plugins: [
    pluginReact(),
    pluginNodePolyfill(),
    pluginLess(),
    pluginSvgr(),
    createPlaygroundCopyPlugin(
      path.join(__dirname, 'dist'),
      path.join(__dirname, '../../packages/android-playground/static'),
      'copy-android-playground-static',
      path.join(__dirname, 'src', 'favicon.ico'),
    ),
    pluginTypeCheck(),
  ],
});
