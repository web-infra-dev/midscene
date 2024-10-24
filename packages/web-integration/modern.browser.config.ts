import { join } from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginNodePolyfill } from '@modern-js/plugin-module-node-polyfill';

export default defineConfig({
  plugins: [
    moduleTools(),
    modulePluginNodePolyfill({
      overrides: {
        'node:fs': join(__dirname, './src/mock_fs.ts'),
      } as any,
    }),
  ],
  buildPreset: 'npm-library',
  buildConfig: {
    platform: 'browser',
    format: 'cjs',
    input: {
      playground: 'src/playground/index.ts',
    },
    outDir: 'dist/browser',
    target: 'es6',
    externals: ['@midscene/core', '@midscene/shared'],
  },
});
