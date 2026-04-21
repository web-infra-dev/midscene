import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginWorkspaceDev } from 'rsbuild-plugin-workspace-dev';
import { commonIgnoreWarnings } from '../../scripts/rsbuild-utils.ts';
import { version as appVersion } from './package.json';
import {
  rendererDevHost,
  rendererDevPort,
} from './scripts/renderer-dev-config.mjs';

const rendererAssetPrefix = process.env.NODE_ENV === 'development' ? '/' : './';

export default defineConfig({
  tools: {
    rspack: {
      ignoreWarnings: commonIgnoreWarnings,
    },
  },
  server: {
    host: rendererDevHost,
    port: rendererDevPort,
  },
  dev: {
    writeToDisk: true,
  },
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginNodePolyfill(),
    pluginTypeCheck(),
    pluginWorkspaceDev(),
  ],
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
      undici: false,
      'fetch-socks': false,
    },
  },
  environments: {
    renderer: {
      html: {
        title: 'Midscene Studio',
      },
      source: {
        entry: {
          index: './src/renderer/index.tsx',
        },
        define: {
          __APP_VERSION__: JSON.stringify(appVersion),
        },
      },
      output: {
        assetPrefix: rendererAssetPrefix,
        target: 'web',
        distPath: {
          root: 'dist/renderer',
        },
        externals: ['sharp'],
        sourceMap: true,
      },
    },
    main: {
      tools: {
        htmlPlugin: false,
      },
      source: {
        entry: {
          main: {
            import: './src/main/index.ts',
            html: false,
          },
        },
      },
      output: {
        target: 'node',
        distPath: {
          root: 'dist/main',
        },
        filename: {
          js: '[name].cjs',
        },
        externals: [
          'electron',
          '@midscene/android',
          '@midscene/android-playground',
          '@midscene/computer',
          '@midscene/computer-playground',
          '@midscene/harmony',
          '@midscene/ios',
          '@midscene/playground',
        ],
        sourceMap: true,
      },
    },
    preload: {
      tools: {
        htmlPlugin: false,
      },
      source: {
        entry: {
          preload: {
            import: './src/preload/index.ts',
            html: false,
          },
        },
      },
      output: {
        target: 'node',
        distPath: {
          root: 'dist/preload',
        },
        filename: {
          js: '[name].cjs',
        },
        externals: ['electron'],
        sourceMap: true,
      },
    },
  },
});
