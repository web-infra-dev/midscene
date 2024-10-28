import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginNodePolyfill } from '@modern-js/plugin-module-node-polyfill';
import { version } from './package.json';
const externals = ['playwright', 'langsmith'];

export default defineConfig({
  buildConfig: [
    {
      platform: 'browser',
      buildType: 'bundle',
      format: 'iife',
      dts: false,
      alias: {
        async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
        '@midscene/core': path.join(
          __dirname,
          './node_modules/@midscene/core/dist/browser',
        ),
        '@midscene/shared': path.join(
          __dirname,
          './node_modules/@midscene/shared/dist/browser',
        ),
      },
      input: {
        popup: 'src/extension/popup.ts',
        worker: 'src/extension/worker.ts',
        'playground-entry': 'src/extension/playground-entry.ts',
      },
      autoExternal: false,
      externals: [...externals],
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
