import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { photonExternal } from '../../scripts/rstest-shared';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const enableAiTest = Boolean(process.env.AITEST);
const enableCliE2eTest = Boolean(process.env.CLI_E2E);
const basicTest = ['tests/unit-test/**/*.test.ts'];
const include = enableAiTest
  ? ['tests/ai/**/*.test.ts']
  : enableCliE2eTest
    ? ['tests/e2e/**/*.test.ts']
    : basicTest;

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  ...(enableCliE2eTest
    ? { pool: { maxWorkers: 1 } }
    : enableAiTest && process.env.CI
      ? { pool: { maxWorkers: 2 } }
      : {}),
  projects: [
    {
      name: '@midscene/cli',
      root: __dirname,
      include,
      exclude: ['tests/unit-test/benchmark-grounding/**'],
      testTimeout: 3 * 60 * 1000,
      retry: enableCliE2eTest ? 0 : process.env.CI ? 1 : 0,
      resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
      },
      output: { externals: photonExternal },
    },
    ...(!enableAiTest && !enableCliE2eTest
      ? [
          {
            name: '@midscene/cli/benchmark-grounding',
            root: __dirname,
            include: ['tests/unit-test/benchmark-grounding/**/*.test.ts'],
            testTimeout: 15000,
            source: {
              define: {
                'import.meta.url': JSON.stringify(
                  pathToFileURL(
                    path.resolve(__dirname, 'src/benchmark-grounding/index.ts'),
                  ).href,
                ),
              },
            },
            resolve: {
              alias: { '@': path.resolve(__dirname, 'src') },
            },
            output: {
              externals: [
                photonExternal,
                '@midscene/core',
                '@midscene/shared/img',
                '@midscene/shared/env',
                '@midscene/shared/logger',
              ],
            },
          },
        ]
      : []),
  ],
});
