import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { version } from './package.json';

// Inject report template into dist if available (self-injection as fallback).
// The placeholder only lives in `src/report-template.ts` — we target that
// single compiled file so we don't have to scan the whole `dist/` tree, and
// we don't accidentally inline the multi-megabyte HTML into any other
// module's output.
const injectReportTemplate = () => ({
  name: 'inject-report-template',
  setup: (api: { onAfterBuild: (fn: () => void) => void }) => {
    api.onAfterBuild(() => {
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

      const magicString = 'REPLACE_ME_WITH_REPORT_HTML';
      const replacedMark = '/*REPORT_HTML_REPLACED*/';
      const regExpForReplace = /\/\*REPORT_HTML_REPLACED\*\/.*/;

      const tplFileContent = fs
        .readFileSync(reportTplPath, 'utf-8')
        .replaceAll(magicString, '');
      const finalContent = `${replacedMark}${JSON.stringify(tplFileContent)}`;

      const candidateFiles = [
        path.resolve(__dirname, 'dist/lib/report-template.js'),
        path.resolve(__dirname, 'dist/es/report-template.mjs'),
      ];
      let injectedCount = 0;

      for (const filePath of candidateFiles) {
        if (!fs.existsSync(filePath)) {
          continue;
        }
        const content = fs.readFileSync(filePath, 'utf-8');

        if (content.includes(replacedMark)) {
          const updated = content.replace(regExpForReplace, () => finalContent);
          fs.writeFileSync(filePath, updated);
          injectedCount++;
          continue;
        }

        if (content.includes(magicString)) {
          const updated = content.replace(
            `'${magicString}'`,
            () => finalContent,
          );
          fs.writeFileSync(filePath, updated);
          injectedCount++;
        }
      }

      if (injectedCount > 0) {
        console.log(
          `[@midscene/core] Report template injected into ${injectedCount} file(s)`,
        );
        return;
      }

      console.warn(
        '[@midscene/core] Report template placeholder was not found in the expected files. If you see "REPLACE_ME_WITH_REPORT_HTML" at runtime, rebuild with "pnpm run build:skip-cache". Reference: https://github.com/web-infra-dev/midscene/blob/main/CONTRIBUTING.md#replace_me_with_report_html-error-in-the-report-file',
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
  plugins: [injectReportTemplate()],
});
