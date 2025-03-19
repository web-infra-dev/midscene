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
        },
      },
      output: {
        target: 'web',
        sourceMap: true,
      },
    },
    node: {
      source: {
        entry: {
          index: './src/worker.ts',
        },
      },
      output: {
        target: 'node',
        sourceMap: true,
        filename: {
          js: 'worker.js',
        },
      },
    },
  },
  output: {
    polyfill: 'entry',
    copy: [{ from: './static', to: './' }],
  },
  source: {
    define: {
      __SDK_VERSION__: JSON.stringify(version),
    },
  },
  resolve: {
    alias: {
      async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      'node:async_hooks': path.join(__dirname, './src/blank_polyfill.ts'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  plugins: [pluginReact(), pluginNodePolyfill(), pluginLess()],
});
