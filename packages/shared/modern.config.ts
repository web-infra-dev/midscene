import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    input: {
      index: './src/index.ts',
      img: './src/img/index.ts',
      constants: './src/constants/index.ts',
      extractor: './src/extractor/index.ts',
      'extractor-debug': './src/extractor/debug.ts',
      fs: './src/node/fs.ts',
      utils: './src/utils.ts',
      logger: './src/logger.ts',
      common: './src/common.ts',
      'us-keyboard-layout': './src/us-keyboard-layout.ts',
    },
    target: 'es2020',
    dts: {
      respectExternal: true,
    },
  },
});
