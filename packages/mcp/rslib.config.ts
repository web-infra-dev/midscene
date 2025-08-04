import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rslib/core';
import { version } from './package.json';

const copyReportTemplate = () => ({
  name: 'copy-report-template',
  setup(api) {
    api.onAfterBuild(({ compiler }) => {
      const shebang = '#!/usr/bin/env node\n';

      // Add shebang to index.cjs
      const cjsPath = path.join(__dirname, 'dist', 'index.cjs');
      if (fs.existsSync(cjsPath)) {
        const content = fs.readFileSync(cjsPath, 'utf-8');
        if (!content.startsWith(shebang)) {
          fs.writeFileSync(cjsPath, shebang + content);
        }
      }

      // Add shebang to index.js
      const jsPath = path.join(__dirname, 'dist', 'index.js');
      if (fs.existsSync(jsPath)) {
        const content = fs.readFileSync(jsPath, 'utf-8');
        if (!content.startsWith(shebang)) {
          fs.writeFileSync(jsPath, shebang + content);
        }
      }
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
  },
  output: {
    copy: [{ from: path.join(__dirname, '../../apps/site/docs/en/api.mdx') }],
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
