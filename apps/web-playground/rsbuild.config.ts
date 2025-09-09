import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

const copyWebPlaygroundStatic = () => ({
  name: 'copy-web-playground-static',
  setup(api) {
    api.onAfterBuild(async () => {
      const srcDir = path.join(__dirname, 'dist');
      const destDir = path.join(
        __dirname,
        '..',
        '..',
        'packages',
        'playground',
        'static',
      );
      const faviconSrc = path.join(__dirname, 'src', 'favicon.ico');
      const faviconDest = path.join(destDir, 'favicon.ico');

      await fs.promises.mkdir(destDir, { recursive: true });
      // Copy directory contents recursively
      await fs.promises.cp(srcDir, destDir, { recursive: true });
      // Copy favicon
      await fs.promises.copyFile(faviconSrc, faviconDest);

      console.log(`Copied build artifacts to ${destDir}`);
      console.log(`Copied favicon to ${faviconDest}`);
    });
  },
});

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginNodePolyfill(),
    pluginSvgr(),
    copyWebPlaygroundStatic(),
    pluginTypeCheck(),
  ],
  resolve: {
    alias: {
      // Polyfill Node.js modules for browser environment
      async_hooks: path.join(
        __dirname,
        '../chrome-extension/src/scripts/blank_polyfill.ts',
      ),
      'node:async_hooks': path.join(
        __dirname,
        '../chrome-extension/src/scripts/blank_polyfill.ts',
      ),
    },
  },
  html: {
    title: 'Midscene Web Playground',
    favicon: './src/favicon.ico',
  },
  source: {
    entry: {
      index: './src/index.tsx',
    },
  },
  output: {
    distPath: {
      root: 'dist',
    },
    sourceMap: true,
    externals: ['sharp'],
  },
});
