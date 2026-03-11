import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { defineConfig } from '@rslib/core';
import { version } from './package.json';

export default defineConfig({
  lib: [
    {
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      bundle: false,
      format: 'cjs',
      syntax: 'es6',
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      bundle: false,
      format: 'esm',
      syntax: 'es6',
      dts: {
        distPath: 'dist/types',
      },
    },
  ],
  source: {
    entry: {
      index: ['./src/**'],
    },
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
  output: {
    target: 'web',
  },
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginSvgr({
      svgrOptions: {
        exportType: 'default',
      },
    }),
    pluginNodePolyfill({
      exclude: ['console'],
    }),
  ],
});
