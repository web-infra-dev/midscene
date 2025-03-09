import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    buildType: 'bundleless',
    format: 'esm',
    externals: ['langsmith'],
    target: 'es2020',
    define: {
      __VERSION__: version,
    },
    splitting: true,
    sourceMap: true,
    autoExtension: true,
  },
});
