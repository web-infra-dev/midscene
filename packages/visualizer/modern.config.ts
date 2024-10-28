import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginNodePolyfill } from '@modern-js/plugin-module-node-polyfill';
import { version } from './package.json';
const externals = ['playwright', 'langsmith'];

export default defineConfig({
  buildConfig: [
    {
      asset: {
        svgr: true,
      },
      alias: {
        async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      },
      format: 'umd',
      dts: false,
      input: {
        report: 'src/index.tsx',
        playground: 'src/playground.tsx',
      },
      umdModuleName: (path) => {
        if (path.includes('playground')) {
          return 'midscenePlayground';
        }
        return 'midsceneVisualizer';
      },
      autoExternal: false,
      externals: [...externals],
      platform: 'browser',
      outDir: 'dist',
      minify: {
        compress: !!process.env.CI,
      },
      define: {
        __VERSION__: JSON.stringify(version),
        global: 'globalThis',
      },
      target: 'es6',
    },
    {
      asset: {
        svgr: true,
      },
      alias: {
        async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      },
      format: 'iife',
      dts: false,
      input: {
        popup: 'src/extension/popup.ts',
        worker: 'src/extension/worker.ts',
        'playground-entry': 'src/extension/playground-entry.ts',
      },
      autoExternal: false,
      externals: [...externals],
      platform: 'browser',
      outDir: 'unpacked-extension/lib',
      target: 'es6',
      define: {
        __VERSION__: JSON.stringify(version),
        global: 'globalThis',
      },
      minify: {
        compress: !!process.env.CI,
      },
    },
  ],
  plugins: [moduleTools(), modulePluginNodePolyfill()],
  buildPreset: 'npm-component',
});
