import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
//@ts-ignore
import dotenv from 'dotenv';

const MIDSCENE_REPORT = process.env.MIDSCENE_REPORT;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // testDir: './tests/ai/e2e',
  testIgnore: process.env.GENERATE_TEST_DATA
    ? undefined
    : 'generate-test-data.spec.ts',
  timeout: 900 * 1000,
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: Boolean(process.env.CI),
  /* Retry on CI only */
  retries: 0, //process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  // reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    deviceScaleFactor: process.platform === 'darwin' ? 2 : 1, // Device scaling factor
  },

  /* Configure projects for major browsers */
  projects: [
    MIDSCENE_REPORT
      ? {
          name: 'report',
          testDir: './tests/ai/web/playwright-report-test',
          use: { ...devices['Desktop Chrome'] },
        }
      : {
          name: 'e2e',
          testDir: './tests/ai/web/playwright',
          use: { ...devices['Desktop Chrome'] },
        },
  ],
  reporter: [['list'], ['./src/playwright/reporter/index.ts']],
});
