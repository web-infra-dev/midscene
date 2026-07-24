/**
 * web-ext configuration
 * https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
 */

const { tmpdir } = require('node:os');
const path = require('node:path');

const extensionReloadSignalPath = path.join(
  tmpdir(),
  'midscene-chrome-extension-reload',
);

module.exports = {
  // Ignore certain files when packaging
  ignoreFiles: [
    'node_modules',
    'src',
    '*.config.*',
    'tsconfig.json',
    'package.json',
    'pnpm-lock.yaml',
    'web-ext-config.cjs',
    'scripts',
    'extension_output',
  ],

  // Build configuration
  build: {
    overwriteDest: true,
  },

  // Run configuration
  run: {
    target: ['chromium'],
    startUrl: ['https://google.com'],
    chromiumBinary:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    chromiumProfile: './web-ext-profile',
    keepProfileChanges: true,
    profileCreateIfMissing: true,
    // Rsbuild updates dist in several steps. Reload only after the build hook
    // writes this signal, so web-ext never observes a missing manifest.json.
    watchFile: [extensionReloadSignalPath],
    // Note: Chrome does not support auto-pinning extensions via command line
    // Users need to manually pin the extension on first run by clicking the puzzle icon
    args: [],
  },
};
