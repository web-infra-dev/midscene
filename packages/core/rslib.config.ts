import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';
import {
  buildReportTemplateInjection,
  isReportTemplateInjectableFile,
  reportTemplateMagicString,
  reportTemplateReplacedMark,
  reportTemplateReplacementRegExp,
} from '../../scripts/report-template-utils.mjs';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';
import { version } from './package.json';

// Inject report template into dist if available (self-injection as fallback)
const injectReportTemplate = () => ({
  name: 'inject-report-template',
  setup: (api: { onAfterBuild: (fn: () => void) => void }) => {
    api.onAfterBuild(() => {
      if (process.env.MIDSCENE_SKIP_REPORT_TEMPLATE_INJECTION) {
        console.warn('[@midscene/core] Report template injection skipped.');
        return;
      }

      const reportTplPath = path.resolve(
        __dirname,
        '../../apps/report/dist/index.html',
      );

      // Only inject if the report template exists
      if (!fs.existsSync(reportTplPath)) {
        console.warn(
          '[@midscene/core] Report template not found. Run "pnpm run build" to generate it.',
        );
        return;
      }

      const { finalContent } = buildReportTemplateInjection(
        fs.readFileSync(reportTplPath, 'utf-8'),
      );

      const distDir = path.resolve(__dirname, 'dist');
      const files = fs.readdirSync(distDir, { recursive: true });
      let injectedCount = 0;

      for (const file of files) {
        if (isReportTemplateInjectableFile(file)) {
          const filePath = path.join(distDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          if (content.includes(reportTemplateReplacedMark)) {
            // Already injected, update it
            const updated = content.replace(
              reportTemplateReplacementRegExp,
              () => finalContent,
            );
            fs.writeFileSync(filePath, updated);
            injectedCount++;
          } else if (content.includes(reportTemplateMagicString)) {
            // First injection
            const updated = content.replace(
              `'${reportTemplateMagicString}'`,
              () => finalContent,
            );
            fs.writeFileSync(filePath, updated);
            injectedCount++;
          }
        }
      }

      if (injectedCount > 0) {
        console.log(
          `[@midscene/core] Report template injected into ${injectedCount} file(s)`,
        );
      }

      // Warning to help users find the solution when they encounter build issues
      console.warn(
        'If you see "REPLACE_ME_WITH_REPORT_HTML" error in the Midscene report file, please rebuild the entire project with "pnpm run build:skip-cache". Reference: https://github.com/web-infra-dev/midscene/blob/main/CONTRIBUTING.md#replace_me_with_report_html-error-in-the-report-file',
      );
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
  plugins: [createTypeCheckPlugin(), injectReportTemplate()],
});
