import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    platform: 'node',
    input: {
      index: './src/index.ts',
      img: './src/img/index.ts',
      constant: './src/constant/index.ts',
    },
    target: 'es2017',
  },
});
