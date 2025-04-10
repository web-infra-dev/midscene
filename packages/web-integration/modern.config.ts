import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

// Create directories and copy files
// The file copying functionality in modern.js is not operating correctly.
const files = [
  [
    'node_modules/@midscene/shared/dist/script/htmlElement.js',
    'iife-script/htmlElement.js',
  ],
  [
    'node_modules/@midscene/shared/dist/script/htmlElementDebug.js',
    'iife-script/htmlElementDebug.js',
  ],
];
files.forEach(([src, dest]) => {
  // Create parent directory if it doesn't exist
  const destDir = path.dirname(path.join(__dirname, dest));
  fs.mkdirSync(destDir, { recursive: true });
  // Copy file
  fs.copyFileSync(path.join(__dirname, src), path.join(__dirname, dest));
});

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    target: 'es2020',
    buildType: 'bundle',
    input: {
      index: 'src/index.ts',
      'bridge-mode': 'src/bridge-mode/index.ts',
      'bridge-mode-browser': 'src/bridge-mode/browser.ts',
      utils: 'src/common/utils.ts',
      'ui-utils': 'src/common/ui-utils.ts',
      puppeteer: 'src/puppeteer/index.ts',
      playwright: 'src/playwright/index.ts',
      playground: 'src/playground/index.ts',
      'midscene-playground': 'src/playground/bin.ts',
      'midscene-server': 'src/playground/server.ts',
      'playwright-report': './src/playwright/reporter/index.ts',
      'chrome-extension': 'src/chrome-extension/index.ts',
      yaml: 'src/yaml/index.ts',
      agent: 'src/common/agent.ts',
    },
    externals: [
      '@midscene/core',
      '@midscene/shared',
      'puppeteer',
      'bufferutil',
      'utf-8-validate',
    ],
    define: {
      __VERSION__: version,
    },
    sourceMap: true,
  },
});
