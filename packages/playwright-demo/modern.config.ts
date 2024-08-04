import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { testingPlugin } from '@modern-js/plugin-testing';

export default defineConfig({
  plugins: [moduleTools(), testingPlugin()],
  buildPreset: 'npm-library-es2019',
  buildConfig: {
    alias: {
      '@playwright/test': path.resolve(
        __dirname,
        'node_modules/@playwright/test',
      ),
    },
  },
  testing: {
    jest: {
      testEnvironment: 'node',
    },
  },
});
