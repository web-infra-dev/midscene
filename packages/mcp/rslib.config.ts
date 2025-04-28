import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { version } from './package.json';

const copyReportTemplate = () => ({
  name: 'copy-report-template',
  setup(api) {
    api.onBeforeBuild(({ compiler }) => {
      const destPath = path.join(__dirname, 'src', 'inject-tp.js');
      const srcPath = path.join(
        __dirname,
        '..',
        '..',
        'apps',
        'report',
        'dist',
        'index.html',
      );
      const reportTemplateContent = fs.readFileSync(srcPath, 'utf-8');

      fs.writeFileSync(
        destPath,
        `
        globalThis.get_midscene_report_tpl = ()=> {
          return decodeURIComponent(\`${encodeURIComponent(
            reportTemplateContent,
          )}\`);
        }
        `,
        'utf-8',
      );
    });
  },
});

export default defineConfig({
  source: {
    define: {
      __VERSION__: `'${version}'`,
    },
    entry: {
      index: './src/index.ts',
    },
    preEntry: ['./src/inject-tp.js'],
  },
  output: {
    copy: [
      { from: path.join(__dirname, '../../apps/site/docs/en/API.mdx') },
      { from: path.join(__dirname, './src/playwright-example.txt') },
    ],
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2021',
      dts: true,
    },
    {
      format: 'cjs',
      syntax: 'es2021',
    },
  ],
  plugins: [copyReportTemplate()],
});
