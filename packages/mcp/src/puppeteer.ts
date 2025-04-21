// fork from https://github.com/modelcontextprotocol/servers/blob/f93737dbb098f8c078365c63c94908598f7db157/src/puppeteer/index.ts

import type { Browser, LaunchOptions } from 'puppeteer';
import type { Page } from 'puppeteer';
import puppeteer from 'puppeteer';
import { deepMerge } from './utils';

// Global state
let browser: Browser | null;
let page: Page | null;
const consoleLogs: string[] = [];
let previousLaunchOptions: any = null;

const DANGEROUS_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--single-process',
  '--disable-web-security',
  '--ignore-certificate-errors',
  '--disable-features=IsolateOrigins',
  '--disable-site-isolation-trials',
  '--allow-running-insecure-content',
];

function getBrowserLaunchOptions(
  launchOptions: LaunchOptions | undefined,
  allowDangerous: boolean | undefined,
): LaunchOptions {
  // Parse environment config safely
  let envConfig = {};
  try {
    envConfig = JSON.parse(process.env.PUPPETEER_LAUNCH_OPTIONS || '{}');
  } catch (error: any) {
    console.warn(
      'Failed to parse PUPPETEER_LAUNCH_OPTIONS:',
      error?.message || error,
    );
  }

  // Deep merge environment config with user-provided options
  const mergedConfig = deepMerge(envConfig, launchOptions || {});

  // Security validation for merged config
  if (mergedConfig?.args) {
    const dangerousArgs = mergedConfig.args?.filter?.((arg: string) =>
      DANGEROUS_ARGS.some((dangerousArg: string) =>
        arg.startsWith(dangerousArg),
      ),
    );
    if (
      dangerousArgs?.length > 0 &&
      !(allowDangerous || process.env.ALLOW_DANGEROUS === 'true')
    ) {
      throw new Error(
        `Dangerous browser arguments detected: ${dangerousArgs.join(', ')}. Found from environment variable and tool call argument. Set allowDangerous: true in the tool call arguments to override.`,
      );
    }
  }

  const npx_args = {
    headless: false,
    defaultViewport: null,
    args: ['--window-size=1920,1080'],
  };
  const docker_args = {
    headless: true,
    args: ['--no-sandbox', '--single-process', '--no-zygote'],
  };

  return deepMerge(
    process.env.DOCKER_CONTAINER ? docker_args : npx_args,
    mergedConfig,
  );
}

async function ensureBrowser({ launchOptions, allowDangerous }: any) {
  const currentLaunchOptions = getBrowserLaunchOptions(
    launchOptions,
    allowDangerous,
  );

  try {
    if (
      (browser && !browser.connected) ||
      JSON.stringify(currentLaunchOptions) !==
        JSON.stringify(previousLaunchOptions)
    ) {
      await browser?.close();
      browser = null;
    }
  } catch (error) {
    console.warn('Error checking or closing existing browser:', error);
    browser = null;
  }

  if (!browser) {
    console.log(
      JSON.stringify({
        'Launching new browser with options': currentLaunchOptions,
      }),
    );
    previousLaunchOptions = currentLaunchOptions;
    browser = await puppeteer.launch(currentLaunchOptions);
    const pages = await browser.pages();
    page = pages[0];
    consoleLogs.length = 0; // Clear logs for new browser session

    return {
      browser,
      pages,
    };
  }
  const pages = await browser.pages();
  return {
    browser,
    pages,
  };
}

export { ensureBrowser };
