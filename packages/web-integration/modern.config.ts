import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    format: 'cjs',
    input: {
      index: 'src/index.ts',
      utils: 'src/common/utils.ts',
      'ui-utils': 'src/common/ui-utils.ts',
      debug: 'src/debug/index.ts',
      puppeteer: 'src/puppeteer/index.ts',
      playwright: 'src/playwright/index.ts',
      playground: 'src/playground/index.ts',
      'midscene-playground': 'src/playground/bin.ts',
      appium: 'src/appium/index.ts',
      'playwright-report': './src/playwright/reporter/index.ts',
      'chrome-extension': 'src/chrome-extension/index.ts',
      yaml: 'src/yaml/index.ts',
    },
    target: 'es2018',
    externals: ['@midscene/core', '@midscene/shared', 'puppeteer'],
  },
});
