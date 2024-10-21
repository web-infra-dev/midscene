import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    platform: 'node',
    input: {
      index: 'src/index.ts',
      utils: 'src/utils.ts',
      image: 'src/image/index.ts',
      'ai-model': 'src/ai-model/index.ts',
    },
    // input: ['src/utils.ts', 'src/index.ts', 'src/image/index.ts'],
    externals: ['node:buffer'],
    target: 'es2017',
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
});
