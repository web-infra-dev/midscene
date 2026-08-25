import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { syncCoreReportTemplateModules } from '../../scripts/report-template-utils.mjs';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

const writeExistingReportTemplate = () => ({
  name: 'write-existing-report-template',
  setup: (api: { onAfterBuild: (fn: () => void) => void }) => {
    api.onAfterBuild(() => {
      try {
        const writtenFiles = syncCoreReportTemplateModules();
        console.log(
          `[@midscene/core] Existing report template written to ${writtenFiles.length} module(s).`,
        );
      } catch (error) {
        console.warn(
          `[@midscene/core] Existing report template is unavailable or invalid; keeping the placeholder template. ${error}`,
        );
      }
    });
  },
});

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
      bundle: false,
    },
    {
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      dts: {
        bundle: false,
        distPath: 'dist/types',
      },
      format: 'esm',
      bundle: false,
      syntax: 'es2020',
    },
  ],
  source: {
    tsconfigPath: 'tsconfig.build.json',
    define: {
      __VERSION__: JSON.stringify(version),
      __DEV_REPORT_PATH__: JSON.stringify(
        process.env.USE_DEV_REPORT
          ? path.resolve(__dirname, '../../apps/report/dist/index.html')
          : '',
      ),
    },
  },
  output: {
    externals: ['undici', 'fetch-socks'],
    sourceMap: true,
  },
  plugins: [createTypeCheckPlugin(), writeExistingReportTemplate()],
});
