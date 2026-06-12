import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RsbuildPlugin, defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { createTypeCheckPlugin } from '../../scripts/rsbuild-utils.ts';

// The viewer JS bundle also carries the placeholder as a quoted string, so
// the injectable form is specifically `>placeholder</script>` (the JSON
// script tag's body) — assert that, matching render.ts in packages/bdd.
const ANCHORED_PLACEHOLDER = '>__EXPLORE_MODEL_PLACEHOLDER__</script>';
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const copyDashboardTemplate = (): RsbuildPlugin => ({
  name: 'copy-bdd-dashboard-template',
  setup(api) {
    api.onAfterBuild(() => {
      const sourcePath = path.join(appRoot, 'dist', 'index.html');
      if (!fs.existsSync(sourcePath)) {
        throw new Error(
          '[bdd-dashboard] Expected build output at apps/bdd-dashboard/dist/index.html',
        );
      }

      const template = fs.readFileSync(sourcePath, 'utf-8');
      assert(
        template.includes(ANCHORED_PLACEHOLDER),
        `[bdd-dashboard] Template is missing "${ANCHORED_PLACEHOLDER}" (the JSON script tag's injectable placeholder)`,
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
