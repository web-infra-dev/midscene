import { defineConfig, moduleTools } from '@modern-js/module-tools';

// It was split into two configuration files because of a bug in the build config array
export default defineConfig({
  plugins: [moduleTools()],
  buildConfig: {
    platform: 'browser',
    buildType: 'bundle',
    format: 'iife',
    dts: false,
    input: {
      htmlElement: 'src/extractor/index.ts',
      htmlElementDebug: 'src/extractor/debug.ts',
    },
    autoExternal: false,
    outDir: 'dist/script',
    esbuildOptions: (options) => {
      options.globalName = 'midscene_element_inspector';
      return options;
    },
    target: 'es6',
  },
});
