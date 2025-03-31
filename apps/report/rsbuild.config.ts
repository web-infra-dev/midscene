import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const testDataPath = path.join(__dirname, 'test-data', 'ai-todo.json');
const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

export default defineConfig({
  html: {
    template: './template/index.html',
    inject: 'body',
    tags: [
      {
        tag: 'script',
        attrs: {
          type: 'midscene_web_dump',
          playwright_test_name: testData.groupName,
          playwright_test_description: testData.groupDescription,
          playwright_test_id: '8465e854a4d9a753cc87-1f096ece43c67754f95a',
          playwright_test_title: 'test open new tab',
          playwright_test_status: 'passed',
          playwright_test_duration: '44274',
        },
        children: JSON.stringify(testData),
      },
    ],
  },
  output: {
    inlineScripts: true,
    injectStyles: true,
  },
  plugins: [pluginReact()],
});
