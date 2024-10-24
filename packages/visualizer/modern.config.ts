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
        '@midscene/core': path.join(
          __dirname,
          './node_modules/@midscene/core/dist/browser',
        ),
        '@midscene/shared': path.join(
          __dirname,
          './node_modules/@midscene/shared/dist/browser',
        ),
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
  ],
  plugins: [moduleTools(), modulePluginNodePolyfill()],
  buildPreset: 'npm-component',
});
