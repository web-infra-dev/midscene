import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { version } from './package.json';

// Read dev report template content at build time (Node.js build environment)
function getDevReportTpl(): string {
  if (!process.env.USE_DEV_REPORT) {
    return '';
  }
  const reportPath = path.resolve(
    __dirname,
    '../../apps/report/dist/index.html',
  );
  try {
    return fs.readFileSync(reportPath, 'utf-8');
  } catch {
    console.warn(
      `Warning: Could not read dev report template from ${reportPath}`,
    );
    return '';
  }
}

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
      // Embed dev report template content directly (read at build time)
      __DEV_REPORT_TPL__: JSON.stringify(getDevReportTpl()),
    },
  },
  output: {
    sourceMap: true,
  },
  plugins: [
    {
      name: 'build-warning-plugin',
      setup: (api) => {
        api.onAfterBuild(() => {
          console.warn(
            'If you see "REPLACE_ME_WITH_REPORT_HTML" error in the Midscene report file, please rebuild the entire project with "pnpm run build:skip-cache". Reference: https://github.com/web-infra-dev/midscene/blob/main/CONTRIBUTING.md#replace_me_with_report_html-error-in-the-report-file',
          );
        });
      },
    },
  ],
});
