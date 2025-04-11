import { readFileSync } from 'node:fs';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';

import { PuppeteerAgent } from '@/puppeteer/index';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import puppeteer from 'puppeteer';

export const defaultUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
export const defaultViewportWidth = 1440;
export const defaultViewportHeight = 768;
export const defaultViewportScale = process.platform === 'darwin' ? 2 : 1;
export const defaultWaitForNetworkIdleTimeout = 6 * 1000;

interface FreeFn {
  name: string;
  fn: () => void;
}

const launcherDebug = getDebug('puppeteer:launcher');

export async function launchPuppeteerPage(
  target: MidsceneYamlScriptWebEnv,
  preference?: {
    headed?: boolean;
    keepWindow?: boolean;
  },
) {
  assert(target.url, 'url is required');
  const freeFn: FreeFn[] = [];

  // prepare the environment
  const ua = target.userAgent || defaultUA;
  let width = defaultViewportWidth;
  let preferMaximizedWindow = true;
  if (target.viewportWidth) {
    preferMaximizedWindow = false;
    assert(
      typeof target.viewportWidth === 'number',
      'viewportWidth must be a number',
    );
    width = Number.parseInt(target.viewportWidth as unknown as string, 10);
    assert(width > 0, `viewportWidth must be greater than 0, but got ${width}`);
  }
  let height = defaultViewportHeight;
  if (target.viewportHeight) {
    preferMaximizedWindow = false;
    assert(
      typeof target.viewportHeight === 'number',
      'viewportHeight must be a number',
    );
    height = Number.parseInt(target.viewportHeight as unknown as string, 10);
    assert(
      height > 0,
      `viewportHeight must be greater than 0, but got ${height}`,
    );
  }
  let dpr = defaultViewportScale;
  if (target.viewportScale) {
    preferMaximizedWindow = false;
    assert(
      typeof target.viewportScale === 'number',
      'viewportScale must be a number',
    );
    dpr = Number.parseInt(target.viewportScale as unknown as string, 10);
    assert(dpr > 0, `viewportScale must be greater than 0, but got ${dpr}`);
  }
  const viewportConfig = {
    width,
    height,
    deviceScaleFactor: dpr,
  };

  const headed = preference?.headed || preference?.keepWindow;

  // only maximize window in headed mode
  preferMaximizedWindow = preferMaximizedWindow && !!headed;

  // launch the browser
  if (headed && process.env.CI === '1') {
    console.warn(
      'you are probably running headed mode in CI, this will usually fail.',
    );
  }
  // do not use 'no-sandbox' on windows https://www.perplexity.ai/search/how-to-solve-this-with-nodejs-dMHpdCypRa..JA8TkQzbeQ
  const isWindows = process.platform === 'win32';
  const args = [
    ...(isWindows ? [] : ['--no-sandbox', '--disable-setuid-sandbox']),
    '--disable-features=HttpsFirstBalancedModeAutoEnable',
    '--disable-features=PasswordLeakDetection',
    '--disable-save-password-bubble',
    `--user-agent="${ua}"`,
    preferMaximizedWindow
      ? '--start-maximized'
      : `--window-size=${width},${height + 200}`, // add 200px for the address bar
  ];

  launcherDebug(
    'launching browser with viewport, headed: %s, viewport: %j, args: %j',
    headed,
    viewportConfig,
    args,
  );
  const browser = await puppeteer.launch({
    headless: !headed,
    defaultViewport: viewportConfig,
    args,
    acceptInsecureCerts: target.acceptInsecureCerts,
  });
  freeFn.push({
    name: 'puppeteer_browser',
    fn: () => {
      if (!preference?.keepWindow) {
        if (isWindows) {
          setTimeout(() => {
            browser.close();
          }, 800);
        } else {
          browser.close();
        }
      }
    },
  });

  const pages = await browser.pages();
  const page = pages[0];
  // await page.setUserAgent(ua);
  // await page.setViewport(viewportConfig);

  if (target.cookie) {
    const cookieFileContent = readFileSync(target.cookie, 'utf-8');
    await page.setCookie(...JSON.parse(cookieFileContent));
  }

  const waitForNetworkIdleTimeout =
    typeof target.waitForNetworkIdle?.timeout === 'number'
      ? target.waitForNetworkIdle.timeout
      : defaultWaitForNetworkIdleTimeout;

  try {
    await page.goto(target.url);
    if (waitForNetworkIdleTimeout > 0) {
      await page.waitForNetworkIdle({
        timeout: waitForNetworkIdleTimeout,
      });
    }
  } catch (e) {
    if (
      typeof target.waitForNetworkIdle?.continueOnNetworkIdleError ===
        'boolean' &&
      !target.waitForNetworkIdle?.continueOnNetworkIdleError
    ) {
      const newError = new Error(`failed to wait for network idle: ${e}`, {
        cause: e,
      });
      throw newError;
    }
    const newMessage = `failed to wait for network idle after ${waitForNetworkIdleTimeout}ms, but the script will continue.`;
    console.warn(newMessage);
  }

  return { page, freeFn };
}

export async function puppeteerAgentForTarget(
  target: MidsceneYamlScriptWebEnv,
  preference?: {
    headed?: boolean;
    keepWindow?: boolean;
    testId?: string;
    cacheId?: string;
  },
) {
  const { page, freeFn } = await launchPuppeteerPage(target, preference);

  // prepare Midscene agent
  const agent = new PuppeteerAgent(page, {
    autoPrintReportMsg: false,
    testId: preference?.testId,
    cacheId: preference?.cacheId,
    aiActionContext: target.aiActionContext,
    forceSameTabNavigation:
      typeof target.forceSameTabNavigation !== 'undefined'
        ? target.forceSameTabNavigation
        : true, // true for default in yaml script
  });

  freeFn.push({
    name: 'midscene_puppeteer_agent',
    fn: () => agent.destroy(),
  });

  return { agent, freeFn };
}
