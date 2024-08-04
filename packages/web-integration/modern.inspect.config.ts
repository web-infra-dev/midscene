import { defineConfig, moduleTools } from '@modern-js/module-tools';

// It was split into two configuration files because of a bug in the build config array
export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    buildType: 'bundle',
    format: 'iife',
    input: {
      htmlElement: 'src/extractor/index.ts',
    },
    outDir: 'dist/script',
    esbuildOptions: (options) => {
      options.globalName = 'midscene_element_inspector';
      return options;
    },
    target: 'es2017',
  },
});
