import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginWorkspaceDev } from 'rsbuild-plugin-workspace-dev';
import { syncCoreReportTemplateModules } from '../../scripts/report-template-utils.mjs';
import {
  commonIgnoreWarnings,
  createTypeCheckPlugin,
} from '../../scripts/rsbuild-utils.ts';

// Read all JSON files from test-data directory
const testDataDir = path.join(__dirname, 'test-data');
const jsonFiles = fs
  .readdirSync(testDataDir)
  .filter((file) => file.endsWith('.json'));
const allTestData = jsonFiles.map((file) => {
  const filePath = path.join(testDataDir, file);
  const fixture = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
    dump: {
      groupDescription?: string;
      groupName?: string;
    };
    images: Record<string, string>;
  };
  return {
    fileName: file,
    fixture,
  };
});

const writeReportTemplate = () => ({
  name: 'write-report-template',
  setup(api: {
    onAfterBuild: (arg0: ({ compiler }: { compiler: any }) => void) => void;
  }) {
    api.onAfterBuild(() => {
      const writtenFiles = syncCoreReportTemplateModules();
      console.log(
        `[@midscene/report] Report template written to ${writtenFiles.length} core module(s).`,
      );
    });
  },
});

export default defineConfig({
  html: {
    template: './template/index.html',
    inject: 'body',
    tags:
      process.env.NODE_ENV === 'development'
        ? allTestData.flatMap((item, index) => [
            ...Object.entries(item.fixture.images).map(([id, dataUri]) => ({
              tag: 'script',
              attrs: {
                type: 'midscene-image',
                'data-id': id,
              },
              children: dataUri,
            })),
            {
              tag: 'script',
              attrs: {
                type: 'midscene_web_dump',
                playwright_test_description: item.fixture.dump.groupDescription,
                playwright_test_id: `id-${index}`,
                playwright_test_title: item.fixture.dump.groupName,
                playwright_test_status: 'passed',
                playwright_test_duration: Math.round(
                  Math.random() * 100000,
                ).toString(),
              },
              children: JSON.stringify(item.fixture.dump),
            },
          ])
        : [],
  },
  source: {
    tsconfigPath: 'tsconfig.build.json',
    define: {
      // Identify this bundle as the Report Viewer build. Consumers can use
      // this build context without changing standalone Playground or SDK builds.
      __MIDSCENE_REPORT_BUILD__: 'true',
    },
  },
  resolve: {
    alias: {
      async_hooks: path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
      // Proxy support is guarded by ifInBrowser in @midscene/core. Stub its
      // Node-only dependencies so browser bundlers do not walk their internals.
      undici: false,
      'fetch-socks': false,
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
    assetPrefix: './',
    inlineScripts: true,
    injectStyles: true,
  },
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginNodePolyfill(),
    pluginSvgr(),
    writeReportTemplate(),
    createTypeCheckPlugin(),
    pluginWorkspaceDev({
      projects: {
        '@midscene/report': {
          skip: true,
        },
      },
    }),
  ],
});
