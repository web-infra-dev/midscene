import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  buildConfig: {
    asset: {
      svgr: true,
    },
    format: 'umd',
    umdModuleName: 'midSceneVisualizer',
    autoExternal: false,
    externals: [],
    dts: false,
    platform: 'browser',
    outDir: 'dist',
    minify: {
      // compress: false,
    },
  },
  plugins: [moduleTools()],
});
