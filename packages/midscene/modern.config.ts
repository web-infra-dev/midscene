import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: [
    {
      platform: 'node',
      input: {
        index: 'src/index.ts',
        utils: 'src/utils.ts',
        'ai-model': 'src/ai-model/index.ts',
      },
      outDir: 'dist/lib',
      externals: ['langsmith'],
      target: 'es6',
    },
    {
      platform: 'browser',
      input: {
        index: 'src/index.ts',
        utils: 'src/utils.ts',
        'ai-model': 'src/ai-model/index.ts',
      },
      outDir: 'dist/browser',
      externals: ['langsmith'],
      target: 'es6',
    },
  ],
});
