import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginNodePolyfill } from '@modern-js/plugin-module-node-polyfill';
import { version } from './package.json';
const externals = ['playwright', 'langsmith'];

const aliasConfig = {
  async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
};

export default defineConfig({
  buildConfig: [
    {
      asset: {
        svgr: true,
      },
      alias: aliasConfig,
      // alias: {
      //   async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      // },
      format: 'umd',
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
      dts: false,
      platform: 'browser',
      outDir: 'dist',
      minify: {
        compress: true,
      },
      define: {
        __VERSION__: JSON.stringify(version),
        global: 'globalThis',
      },
    },
    // {
    //   asset: {
    //     svgr: true,
    //   },
    //   format: 'esm',
    //   input: {
    //     index: 'src/index.tsx',
    //   },
    //   autoExternal: false,
    //   externals: [],
    //   dts: false,
    //   platform: 'browser',
    //   minify: {
    //     compress: false,
    //   },
    // },
  ],
  plugins: [moduleTools(), modulePluginNodePolyfill()],
  buildPreset: 'npm-component',
});
