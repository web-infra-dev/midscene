import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { version } from './package.json';

// Inject report template into dist if available (self-injection as fallback)
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

      const distDir = path.resolve(__dirname, 'dist');
      const files = fs.readdirSync(distDir, { recursive: true });
      let injectedCount = 0;

      for (const file of files) {
        if (
          typeof file === 'string' &&
          (file.endsWith('.js') || file.endsWith('.mjs'))
        ) {
          const filePath = path.join(distDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          if (content.includes(replacedMark)) {
            // Already injected, update it
            const updated = content.replace(
              regExpForReplace,
              () => finalContent,
            );
            fs.writeFileSync(filePath, updated);
            injectedCount++;
          } else if (content.includes(magicString)) {
            // First injection
            const updated = content.replace(
              `'${magicString}'`,
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
