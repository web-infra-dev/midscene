import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { version as appVersion } from './package.json';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3210,
  },
  dev: {
    writeToDisk: true,
  },
  plugins: [pluginReact(), pluginLess(), pluginTypeCheck()],
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
        target: 'web',
        distPath: {
          root: 'dist/renderer',
        },
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
        externals: ['electron'],
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
