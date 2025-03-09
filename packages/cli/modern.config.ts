import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    format: 'esm',
    target: 'es6',
    define: {
      __VERSION__: version,
    },
    buildType: 'bundleless',
    autoExtension: true,
  },
});
