import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    platform: 'node',
    input: {
      index: 'src/index.ts',
      help: 'src/help.ts',
      playground: 'src/playground.ts',
    },
    // input: ['src/utils.ts', 'src/index.ts', 'src/image/index.ts'],
    externals: ['node:buffer'],
    target: 'es6',
  },
});
