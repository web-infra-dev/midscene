import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));

export const reportTemplateConfig = defineConfig({
  root: dashboardDir,
  plugins: [pluginReact()],
  source: {
    entry: {
      index: path.join(dashboardDir, 'src/report-template/main.tsx'),
    },
  },
  html: {
    template: path.join(dashboardDir, 'report-template/index.html'),
    inject: 'body',
  },
  output: {
    cleanDistPath: false,
    inlineScripts: true,
    inlineStyles: true,
    dataUriLimit: {
      image: 100 * 1024,
      svg: 100 * 1024,
      font: 4 * 1024,
      media: 4 * 1024,
      assets: 4 * 1024,
    },
    filenameHash: false,
    distPath: {
      root: '../output/cache/report-template',
      html: './',
      js: './',
      jsAsync: './',
      css: './',
      cssAsync: './',
      image: './',
      media: './',
      font: './',
      svg: './',
      assets: './',
    },
  },
  tools: {
    rspack: {
      module: {
        parser: {
          javascript: {
            dynamicImportMode: 'eager',
          },
        },
      },
      output: {
        chunkLoading: false,
      },
      optimization: {
        runtimeChunk: false,
        splitChunks: false,
      },
    },
  },
});

export default reportTemplateConfig;
