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
    format: 'esm',
    target: 'es6',
    buildType: 'bundleless',
    define: {
      __VERSION__: version,
    },
    sourceMap: true,
    autoExtension: true,
  },
});
