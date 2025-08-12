import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type rsbuild } from '@rslib/core';
import { version } from './package.json';

const copyDtsFiles: rsbuild.RsbuildPlugin = {
  name: 'copy-dts-files',
  setup(api) {
    api.onAfterBuild(() => {
      const typesDir = path.join(process.cwd(), 'dist/types');
      const sourcePath = path.join(process.cwd(), 'src', 'common', 'page.d.ts');
      const destPath = path.join(typesDir, 'common', 'page.d.ts');
      fs.copyFileSync(sourcePath, destPath);
    });
  },
};

export default defineConfig({
  lib: [
    {
      bundle: false,
      output: {
        distPath: {
          root: 'dist/lib',
        },
      },
      format: 'cjs',
      syntax: 'es2020',
    },
    {
      bundle: false,
      output: {
        distPath: {
          root: 'dist/es',
        },
      },
      format: 'esm',
      syntax: 'es2020',
      dts: {
        distPath: 'dist/types',
      },
    },
  ],
  source: {
    define: {
      __VERSION__: JSON.stringify(version),
    },
  },
  output: {
    sourceMap: true,
  },
  plugins: [copyDtsFiles],
});
