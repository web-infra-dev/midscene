import path from 'node:path';
import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';

const sharedAlias = {
  '@midscene/playground/recorder-ui-describer$': path.resolve(
    __dirname,
    '../../packages/playground/src/recorder-ui-describer.ts',
  ),
  // `electron-updater` runs `require('electron').app.getVersion()` at module
  // init, which throws outside Electron. Alias it to a benign stub so importing
  // it never touches Electron; tests still layer `rs.mock('electron-updater')`
  // on top when they need specific behavior. See tests/stubs/electron-updater.ts.
  'electron-updater$': path.resolve(
    __dirname,
    'tests/stubs/electron-updater.ts',
  ),
};

export default defineConfig({
  plugins: [pluginReact()],
  resolve: { alias: sharedAlias },
  coverage: createCoverageConfig(__dirname),
  // Only the `@vitest-environment jsdom` docblock files need the storage
  // polyfill, but it is harmless under node, so it is applied globally.
  setupFiles: [
    path.resolve(__dirname, '../../scripts/rstest-jsdom-storage.ts'),
  ],
  include: ['tests/**/*.test.{mjs,ts,tsx}'],
});
