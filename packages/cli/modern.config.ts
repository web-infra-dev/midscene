import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    input: {
      index: 'src/index.ts',
    },
    externals: ['node:buffer', 'puppeteer'],
    target: 'es2020',
    define: {
      __VERSION__: version,
    },
    sourceMap: true,
  },
});
