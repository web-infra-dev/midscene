import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';

const copyAndroidPlaygroundStatic = () => ({
  name: 'copy-android-playground-static',
  setup(api) {
    api.onAfterBuild(async () => {
      const srcDir = path.join(__dirname, 'dist');
      const destDir = path.join(
        __dirname,
        '..',
        '..',
        'packages',
        'android-playground',
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
  environments: {
    web: {
      source: {
        entry: {
          index: './src/index.tsx',
        },
      },
      output: {
        target: 'web',
        sourceMap: true,
      },
      html: {
        title: 'Midscene Android Playground',
      },
    },
  },
  dev: {
    writeToDisk: true,
  },
  resolve: {
    alias: {
      async_hooks: path.join(__dirname, './src/scripts/blank_polyfill.ts'),
      'node:async_hooks': path.join(
        __dirname,
        './src/scripts/blank_polyfill.ts',
      ),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  plugins: [
    pluginReact(),
    pluginNodePolyfill(),
    pluginLess(),
    pluginSvgr(),
    copyAndroidPlaygroundStatic(),
  ],
});
