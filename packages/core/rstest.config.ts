import path from 'node:path';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { defineVersion, photonExternal } from '../../scripts/rstest-shared';
import { version } from './package.json';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
  override: true,
});

const enableAiTest = Boolean(process.env.AITEST);
const basicTest = ['tests/unit-test/**/*.test.ts'];

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  include: enableAiTest ? ['tests/ai/**/*.test.ts'] : basicTest,
  retry: process.env.CI ? 1 : 0,
  source: {
    define: {
      ...defineVersion(version),
      __DEV_REPORT_PATH__: JSON.stringify(
        path.resolve(__dirname, '../../apps/report/dist/index.html'),
      ),
    },
  },
  output: {
    externals: photonExternal,
  },
});
