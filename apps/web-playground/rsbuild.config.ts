import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginNodePolyfill(),
    pluginSvgr(),
    pluginTypeCheck(),
  ],
  resolve: {
    alias: {
      // Polyfill Node.js modules for browser environment
      async_hooks: path.join(
        __dirname,
        '../chrome-extension/src/scripts/blank_polyfill.ts',
      ),
      'node:async_hooks': path.join(
        __dirname,
        '../chrome-extension/src/scripts/blank_polyfill.ts',
      ),
    },
  },
  html: {
    title: 'Midscene Web Playground',
    favicon: './src/favicon.ico',
  },
  source: {
    entry: {
      index: './src/index.tsx',
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
