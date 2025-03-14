import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginNodePolyfill } from '@modern-js/plugin-module-node-polyfill';
import { version } from './package.json';
const externals = ['playwright', 'bufferutil', 'utf-8-validate'];

const commonConfig = {
  asset: {
    svgr: true,
  },
  autoExternal: false,
  externals: [...externals],
  target: 'es2020',
  minify: process.env.CI
    ? {
        compress: true,
      }
    : undefined,
  define: {
    __VERSION__: version,
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
      platform: 'browser',
      outDir: 'dist',
      target: 'es2020',
    },
    {
      ...commonConfig,
      alias: {
        async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      },
      format: 'iife',
      dts: false,
      input: {
        'water-flow': 'src/extension/scripts/water-flow.ts',
        'stop-water-flow': 'src/extension/scripts/stop-water-flow.ts',
        popup: 'src/extension/popup.tsx',
        worker: 'src/extension/worker.ts',
        'playground-entry': 'src/extension/playground-entry.tsx',
      },
      platform: 'browser',
      outDir: 'unpacked-extension/lib',
      target: 'es2020',
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
