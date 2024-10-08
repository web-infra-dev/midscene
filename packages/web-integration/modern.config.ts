import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    platform: 'node',
    shims: true,
    input: {
      index: 'src/index.ts',
      debug: 'src/debug/index.ts',
      puppeteer: 'src/puppeteer/index.ts',
      playwright: 'src/playwright/index.ts',
      appium: 'src/appium/index.ts',
      'playwright-report': './src/playwright/reporter/index.ts',
    },
    target: 'es2017',
    externals: ['@midscene/core', 'node:fs'],
  },
});
