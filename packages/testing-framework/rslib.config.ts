import { defineConfig } from '@rslib/core';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

export default defineConfig({
  lib: [
    {
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      dts: {
        bundle: true,
        distPath: 'dist/types',
      },
      format: 'esm',
      syntax: 'es2020',
    },
  ],
  source: {
    tsconfigPath: 'tsconfig.build.json',
    entry: {
      index: './src/index.ts',
      cli: './src/cli.ts',
      // Standalone worker entry imported by the generated Rstest virtual
      // modules; must stay a separate file (not bundled into index/cli).
      'rstest-entry': './src/rstest/entry.ts',
    },
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
  output: {
    // Pi and the platform UI agents are heavy runtime deps; keep them external.
    // Rstest is provided by the project running the suite (resolved at runtime).
    externals: [
      '@earendil-works/pi-coding-agent',
      '@earendil-works/pi-ai',
      '@midscene/web',
      '@midscene/web/puppeteer-agent-launcher',
      '@rstest/core',
      '@rstest/core/api',
    ],
  },
  plugins: [createTypeCheckPlugin()],
});
