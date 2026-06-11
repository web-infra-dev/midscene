import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';

const DATA_PLACEHOLDER = '__EXPLORE_MODEL_PLACEHOLDER__';
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const copyDashboardTemplate = () => ({
  name: 'copy-bdd-dashboard-template',
  setup(api: { onAfterBuild: (fn: () => void) => void }) {
    api.onAfterBuild(() => {
      const sourcePath = path.join(appRoot, 'dist', 'index.html');
      if (!fs.existsSync(sourcePath)) {
        throw new Error(
          '[bdd-dashboard] Expected build output at apps/bdd-dashboard/dist/index.html',
        );
      }

      const template = fs.readFileSync(sourcePath, 'utf-8');
      assert(
        template.includes(DATA_PLACEHOLDER),
        `[bdd-dashboard] Template is missing placeholder "${DATA_PLACEHOLDER}"`,
      );

      const targetPath = path.join(
        appRoot,
        '..',
        '..',
        'packages',
        'bdd',
        'static',
        'dashboard-template.html',
      );
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, template);
      console.log(
        '[bdd-dashboard] Copied template to packages/bdd/static/dashboard-template.html',
      );
    });
  },
});

export default defineConfig({
  html: {
    template: './template/index.html',
    inject: 'body',
  },
  source: {
    entry: {
      index: './src/index.tsx',
    },
    tsconfigPath: 'tsconfig.build.json',
  },
  dev: {
    writeToDisk: true,
  },
  output: {
    assetPrefix: './',
    inlineScripts: true,
    inlineStyles: true,
  },
  plugins: [pluginReact(), copyDashboardTemplate(), createTypeCheckPlugin()],
});
