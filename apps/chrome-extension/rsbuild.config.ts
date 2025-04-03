import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { version } from '../../packages/visualizer/package.json';

export default defineConfig({
  environments: {
    web: {
      source: {
        entry: {
          index: './src/index.tsx',
          popup: './src/extension/popup.tsx',
        },
      },
      output: {
        target: 'web',
        sourceMap: true,
      },
      html: {
        tags: [
          {
            tag: 'script',
            attrs: { src: 'scripts/report-template.js' },
            head: true,
            append: true,
          },
        ],
      },
    },
    node: {
      source: {
        entry: {
          worker: './src/scripts/worker.ts',
          'stop-water-flow': './src/scripts/stop-water-flow.ts',
          'water-flow': './src/scripts/water-flow.ts',
        },
      },
      output: {
        target: 'node',
        sourceMap: true,
        filename: {
          js: 'scripts/[name].js',
        },
      },
    },
  },
  dev: {
    writeToDisk: true,
  },
  output: {
    polyfill: 'entry',
    injectStyles: true,
    copy: [
      { from: './static', to: './' },
      {
        from: path.resolve(
          __dirname,
          '../../packages/web-integration/iife-script',
        ),
        to: 'scripts',
      },
    ],
  },
  source: {
    define: {
      __SDK_VERSION__: JSON.stringify(version),
    },
  },
  resolve: {
    alias: {
      async_hooks: path.join(__dirname, './src/scripts/blank_polyfill.ts'),
      'node:async_hooks': path.join(
        __dirname,
        './src/scripts/blank_polyfill.ts',
      ),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  plugins: [pluginReact(), pluginNodePolyfill(), pluginLess()],
});
