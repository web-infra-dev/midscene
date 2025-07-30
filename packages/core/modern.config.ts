import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

export default defineConfig({
  plugins: [moduleTools()],
  buildPreset: 'npm-library',
  buildConfig: {
    input: {
      index: 'src/index.ts',
      utils: 'src/utils.ts',
      tree: 'src/tree.ts',
      'ai-model': 'src/ai-model/index.ts',
    },
    externals: ['langsmith', '@midscene/shared'],
    target: 'es2020',
    define: {
      __VERSION__: version,
      __DEV_REPORT_PATH__: process.env.USE_DEV_REPORT
        ? path.resolve(__dirname, '../../apps/report/dist/index.html')
        : '',
    },
    splitting: true,
    sourceMap: true,
    dts: {
      respectExternal: true,
    },
  },
});
