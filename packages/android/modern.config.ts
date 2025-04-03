import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    input: {
      index: './src/index.ts',
      playground: './src/playground/bin.ts',
    },
    target: 'es2020',
    dts: {
      respectExternal: true,
    },
  },
});
