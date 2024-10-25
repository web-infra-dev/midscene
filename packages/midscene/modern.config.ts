import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: [
    {
      format: 'umd',
      input: {
        index: 'src/index.ts',
        utils: 'src/utils.ts',
        'ai-model': 'src/ai-model/index.ts',
      },
      outDir: 'dist/lib',
      externals: ['langsmith'],
      target: 'es6',
      define: {
        __VERSION__: version,
      },
    },
  ],
});
