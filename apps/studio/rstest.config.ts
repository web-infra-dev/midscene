import path from 'node:path';
import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

const sharedAlias = {
  '@main': path.resolve(__dirname, 'src/main'),
  '@preload': path.resolve(__dirname, 'src/preload'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
  '@shared': path.resolve(__dirname, 'src/shared'),
  '@midscene/playground/recorder-ui-describer$': path.resolve(
    __dirname,
    '../../packages/playground/src/recorder-ui-describer.ts',
  ),
};

export default defineConfig({
  plugins: [pluginReact()],
  resolve: { alias: sharedAlias },
  coverage: createCoverageConfig(__dirname),
  // TODO(https://github.com/web-infra-dev/rstest/issues/1456): rstest
  // externalizes third-party deps in the node environment by default, and an
  // externalized module is still *evaluated* even when `rs.mock()`-ed. The real
  // `electron-updater` then runs its init `require('electron').app.getVersion()`
  // and crashes (outside Electron, `require('electron')` is a path string, so
  // `app` is undefined) before the mock can apply. Bundling the deps makes the
  // mock fully replace the module so the real one never runs. Bundle ALL deps
  // (not a scoped allowlist): an allowlist would override jsdom's default of
  // bundling everything and break component suites that import e.g.
  // @ant-design/icons. Drop this once rstest stops evaluating mocked externals.
  output: { bundleDependencies: true },
  // Default to node; jsdom is selected per file via the `@vitest-environment
  // jsdom` docblock. The storage polyfill is harmless under node, so it can be
  // applied globally.
  testEnvironment: 'node',
  setupFiles: [
    path.resolve(__dirname, '../../scripts/rstest-jsdom-storage.ts'),
  ],
  include: ['tests/**/*.test.{mjs,ts,tsx}'],
  ...stubStyleRules,
});
