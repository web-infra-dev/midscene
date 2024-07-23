import { moduleTools, defineConfig } from '@modern-js/module-tools';

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
    externals: ['langsmith/wrappers', 'buffer'],
    target: 'es2017'
  },
});
