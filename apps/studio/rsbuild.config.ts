import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import {
  commonIgnoreWarnings,
  createTypeCheckPlugin,
} from '../../scripts/rsbuild-utils.ts';
import { version as appVersion } from './package.json';
import {
  rendererDevHost,
  rendererDevPort,
} from './scripts/renderer-dev-config.mjs';

// Studio is loaded by Electron through both the dev server and built
// `file://` HTML. A relative prefix works in both places; an absolute
// `/static/...` prefix leaves packaged/build smoke runs with a blank renderer.
const rendererAssetPrefix = './';
const studioRecorderEntryEnabled =
  process.env.VITE_STUDIO_RECORDER_ENABLED !== 'false';

export default defineConfig({
  source: {
    tsconfigPath: 'tsconfig.build.json',
  },
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
    pluginSvgr({
      // Only source-imported workspace components (for example
      // @midscene/playground-app) rely on default SVG-as-React-component
      // imports. Studio's own assets use new URL(...).href and should stay
      // as asset URLs.
      excludeImporter: /apps[\\/]studio[\\/]src[\\/]/,
      svgrOptions: {
        exportType: 'default',
      },
    }),
    pluginLess(),
    pluginNodePolyfill(),
    createTypeCheckPlugin(),
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
      // Renderer lazy chunks import playground-app on demand. Point dev/build
      // resolution at the workspace source so Rsbuild does not depend on the
      // package dist entry during rslib watch rebuild windows.
      '@midscene/playground-app$': path.join(
        __dirname,
        '../../packages/playground-app/src/index.ts',
      ),
      // Source-imported renderer packages depend on @midscene/playground.
      // Resolve that package to its browser-safe source entry so lazy chunks
      // do not depend on dist/es/index.browser.mjs existing during rslib
      // watch rebuild windows. Keep this exact-match only: the Node-side
      // server entry remains externalized in the main process build.
      '@midscene/playground$': path.join(
        __dirname,
        '../../packages/playground/src/index.browser.ts',
      ),
      // Same reason as playground-app: renderer imports visualizer directly and
      // via playground-app. Use source entries so rslib watch cannot break lazy
      // compilation while dist files are being removed and rebuilt.
      '@midscene/visualizer$': path.join(
        __dirname,
        '../../packages/visualizer/src/index.tsx',
      ),
      '@midscene/visualizer/history-selector$': path.join(
        __dirname,
        '../../packages/visualizer/src/component/history-selector/index.tsx',
      ),
      '@midscene/web/static$': path.join(
        __dirname,
        '../../packages/web-integration/src/static/index.ts',
      ),
      '@/utils$': path.join(
        __dirname,
        '../../packages/visualizer/src/utils/index.ts',
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
          __STUDIO_RECORDER_ENTRY_ENABLED__: JSON.stringify(
            studioRecorderEntryEnabled,
          ),
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
          'electron-updater',
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
