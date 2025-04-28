import { readFileSync } from 'node:fs';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { version } from './package.json';

const reportTpl = readFileSync('./report/index.html', 'utf-8');

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
    externals: ['langsmith'],
    target: 'es2020',
    define: {
      __VERSION__: version,
      __MIDSCENE_REPORT_TPL__: reportTpl,
    },
    splitting: true,
    sourceMap: true,
    dts: {
      respectExternal: true,
    },
  },
});
