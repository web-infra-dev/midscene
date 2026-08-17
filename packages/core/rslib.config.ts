import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { writeReportTemplateModules } from '../../scripts/report-template-utils.mjs';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

const writeExistingReportTemplate = () => ({
  name: 'write-existing-report-template',
  setup: (api: { onAfterBuild: (fn: () => void) => void }) => {
    api.onAfterBuild(() => {
      const reportTplPath = path.resolve(
        __dirname,
        '../../apps/report/dist/index.html',
      );

      if (!fs.existsSync(reportTplPath)) {
        console.warn(
          '[@midscene/core] Report template not found; keeping the placeholder template.',
        );
        return;
      }

      const distDir = path.resolve(__dirname, 'dist');
      try {
        const writtenFiles = writeReportTemplateModules(
          distDir,
          fs.readFileSync(reportTplPath, 'utf-8'),
        );
        console.log(
          `[@midscene/core] Existing report template written to ${writtenFiles.length} module(s).`,
        );
      } catch (error) {
        console.warn(
          `[@midscene/core] Existing report template is invalid; keeping the placeholder template. ${error}`,
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
    sourceMap: true,
  },
  plugins: [createTypeCheckPlugin(), writeExistingReportTemplate()],
});
