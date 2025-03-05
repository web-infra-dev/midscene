import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    buildType: 'bundleless',
    format: 'esm',
    target: 'es6',
  },
});
