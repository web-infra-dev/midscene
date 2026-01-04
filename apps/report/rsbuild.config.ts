import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { commonIgnoreWarnings } from '@midscene/shared';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginWorkspaceDev } from 'rsbuild-plugin-workspace-dev';

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

// put back the report template to the core package
// this is a workaround for the circular dependency issue
// ERROR: This repository uses pkg in bundler mode. It is necessary to declare @midscene/report in the dependency; otherwise, it may cause packaging order issues and thus lead to the failure of report injection
const copyReportTemplate = () => ({
  name: 'copy-report-template',
  setup(api: {
    onAfterBuild: (arg0: ({ compiler }: { compiler: any }) => void) => void;
  }) {
    api.onAfterBuild(({ compiler }) => {
      const magicString = 'REPLACE_ME_WITH_REPORT_HTML';
      const replacedMark = '/*REPORT_HTML_REPLACED*/';
      const regExpForReplace = /\/\*REPORT_HTML_REPLACED\*\/.*/;

      // read the template file
      const srcPath = path.join(__dirname, 'dist', 'index.html');
      const tplFileContent = fs
        .readFileSync(srcPath, 'utf-8')
        .replaceAll(magicString, '');
      assert(
        !tplFileContent.includes(magicString),
        'magic string should not be in the template file',
      );
      const finalContent = `${replacedMark}${JSON.stringify(tplFileContent)}`;

      // find the core package
      const corePkgDir = path.join(__dirname, '..', '..', 'packages', 'core');
      const corePkgJson = JSON.parse(
        fs.readFileSync(path.join(corePkgDir, 'package.json'), 'utf-8'),
      );
      assert(
        corePkgJson.name === '@midscene/core',
        'core package name is not @midscene/core',
      );
      const corePkgDistDir = path.join(corePkgDir, 'dist');

      // traverse all .js files and inject (or update) the template
      const jsFiles = fs.readdirSync(corePkgDistDir, { recursive: true });
      let replacedCount = 0;
      for (const file of jsFiles) {
        if (
          typeof file === 'string' &&
          (file.endsWith('.js') || file.endsWith('.mjs'))
        ) {
          const filePath = path.join(corePkgDistDir, file.toString());
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          if (fileContent.includes(replacedMark)) {
            assert(
              regExpForReplace.test(fileContent),
              'a replaced mark is found but cannot match',
            );

            const replacedContent = fileContent.replace(
              regExpForReplace,
              () => finalContent,
            );
            fs.writeFileSync(filePath, replacedContent);
            replacedCount++;
            console.log(`Template updated in file ${filePath}`);
          } else if (fileContent.includes(magicString)) {
            const magicStringCount = (
              fileContent.match(new RegExp(magicString, 'g')) || []
            ).length;
            assert(
              magicStringCount === 1,
              'magic string shows more than once in the file, cannot process',
            );
            const replacedContent = fileContent.replace(
              `'${magicString}'`,
              () => finalContent, // there are some $- code in the tpl, so we have to use a function as the second argument
            );
            fs.writeFileSync(filePath, replacedContent);
            replacedCount++;
            console.log(`Template injected into ${filePath}`);
          }
        }
      }
      if (replacedCount === 0) {
        throw new Error('No html template found in the core package');
      }
    });
  },
});

export default defineConfig({
  html: {
    template: './template/index.html',
    inject: 'body',
    tags:
      process.env.NODE_ENV === 'development'
        ? allTestData.map((item, index) => ({
            tag: 'script',
            attrs: {
              type: 'midscene_web_dump',
              playwright_test_description: item.data.groupDescription,
              playwright_test_id: `id-${index}`,
              playwright_test_title: item.data.groupName,
              playwright_test_status: 'passed',
              playwright_test_duration: Math.round(
                Math.random() * 100000,
              ).toString(),
            },
            children: JSON.stringify(item.data),
          }))
        : [],
  },
  resolve: {
    alias: {
      async_hooks: path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
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
      externals: ['sharp'],
      ignoreWarnings: commonIgnoreWarnings,
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
    pluginSvgr(),
    copyReportTemplate(),
    pluginTypeCheck(),
    pluginWorkspaceDev({
      projects: {
        '@midscene/report': {
          skip: true,
        },
      },
    }),
  ],
});
