import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginNodePolyfill } from '@modern-js/plugin-module-node-polyfill';
import { version } from './package.json';
const externals = ['playwright', 'langsmith'];

const commonConfig = {
  asset: {
    svgr: true,
  },
  autoExternal: false,
  externals: [...externals],
  target: 'es6',
  minify: {
    compress: !!process.env.CI,
  },
  define: {
    __VERSION__: JSON.stringify(version),
    global: 'globalThis',
  },
};

export default defineConfig({
  buildConfig: [
    {
      ...commonConfig,
      alias: {
        async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      },
      format: 'umd',
      dts: false,
      input: {
        report: 'src/index.tsx',
      },
      umdModuleName: (path) => {
        // if (path.includes('playground')) {
        //   return 'midscenePlayground';
        // }
        return 'midsceneVisualizer';
      },
      platform: 'browser',
      outDir: 'dist',

      target: 'es6',
    },
    {
      ...commonConfig,
      alias: {
        async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      },
      format: 'iife',
      dts: false,
      input: {
        popup: 'src/extension/popup.tsx',
        worker: 'src/extension/worker.ts',
        'playground-entry': 'src/extension/playground-entry.tsx',
      },
      platform: 'browser',
      outDir: 'unpacked-extension/lib',
      target: 'es6',
    },
  ],
  plugins: [
    moduleTools(),
    modulePluginNodePolyfill({
      excludes: ['console'],
    }),
  ],
  buildPreset: 'npm-component',
});
