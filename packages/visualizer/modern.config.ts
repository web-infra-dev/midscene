import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  buildConfig: [
    {
      asset: {
        svgr: true,
      },
      format: 'umd',
      umdModuleName: 'midSceneVisualizer',
      autoExternal: false,
      externals: [],
      dts: false,
      platform: 'browser',
      outDir: 'dist/report',
      minify: {
        compress: true,
      },
    },
    {
      asset: {
        svgr: true,
      },
      format: 'esm',
      input: {
        index: 'src/index.tsx',
      },
      autoExternal: false,
      externals: [],
      dts: false,
      platform: 'browser',
      minify: {
        compress: false,
      },
    },
  ],
  plugins: [moduleTools()],
  buildPreset: 'npm-component',
});
