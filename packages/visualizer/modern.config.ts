import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

export default defineConfig({
  buildConfig: [
    {
      asset: {
        svgr: true,
      },
      format: 'umd',
      umdModuleName: 'midsceneVisualizer',
      autoExternal: false,
      externals: [],
      dts: false,
      platform: 'browser',
      outDir: 'dist/report',
      minify: {
        compress: true,
      },
      define: {
        __VERSION__: JSON.stringify(version),
      },
    },
    {
      asset: {
        svgr: true,
      },
      format: 'umd',
      input: {
        index: 'src/playground.tsx',
      },
      umdModuleName: 'midscenePlayground',
      autoExternal: false,
      externals: [],
      dts: false,
      platform: 'browser',
      outDir: 'dist/playground',
      minify: {
        compress: true,
      },
      define: {
        __VERSION__: JSON.stringify(version),
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
  plugins: [moduleTools()],
  buildPreset: 'npm-component',
});
