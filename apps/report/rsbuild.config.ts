import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';

// Read all JSON files from test-data directory
const testDataDir = path.join(__dirname, 'test-data');
const jsonFiles = fs
  .readdirSync(testDataDir)
  .filter((file) => file.endsWith('.json'));
const allTestData = jsonFiles.map((file) => {
  const filePath = path.join(testDataDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    fileName: file,
    data,
  };
});

const copyReportTemplate = () => ({
  name: 'copy-report-template',
  setup(api) {
    api.onAfterBuild(({ compiler }) => {
      const srcPath = path.join(__dirname, 'dist', 'index.html');
      const destPath = path.join(
        __dirname,
        '..',
        '..',
        'packages',
        'core',
        'report',
        'index.html',
      );
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    });
  },
});

export default defineConfig({
  html: {
    template: './template/index.html',
    inject: 'body',
    tags:
      process.env.NODE_ENV === 'development'
        ? allTestData.map((item) => ({
            tag: 'script',
            attrs: {
              type: 'midscene_web_dump',
              playwright_test_name: item.data.groupName,
              playwright_test_description: item.data.groupDescription,
              playwright_test_id: '8465e854a4d9a753cc87-1f096ece43c67754f95a',
              playwright_test_title: 'test open new tab',
              playwright_test_status: 'passed',
              playwright_test_duration: '44274',
            },
            children: JSON.stringify(item.data),
          }))
        : [],
  },
  resolve: {
    alias: {
      async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
    },
  },
  dev: {
    writeToDisk: true,
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
    },
  },
  output: {
    inlineScripts: true,
    injectStyles: true,
  },
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginNodePolyfill(),
    copyReportTemplate(),
  ],
});
