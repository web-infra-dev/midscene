import { defineConfig, moduleTools } from '@modern-js/module-tools';

const commonConfig = {
  input: {
    index: './src/index.ts',
    img: './src/img/index.ts',
    constants: './src/constants/index.ts',
    fs: './src/fs/index.ts',
    utils: './src/utils.ts',
  },
};

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: [
    {
      platform: 'node',
      ...commonConfig,
      outDir: 'dist/lib',
      target: 'es2017',
    },
    {
      platform: 'browser',
      ...commonConfig,
      outDir: 'dist/browser',
      target: 'es2017',
    },
  ],
});
