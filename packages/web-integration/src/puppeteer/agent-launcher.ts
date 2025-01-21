import assert from 'node:assert';
import { readFileSync } from 'node:fs';

import { PuppeteerAgent } from '@/puppeteer';
import type { MidsceneYamlScriptEnv } from '@midscene/core';

export const defaultUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
export const defaultViewportWidth = 1280;
export const defaultViewportHeight = 960;
export const defaultViewportScale = process.platform === 'darwin' ? 2 : 1;
export const defaultWaitForNetworkIdleTimeout = 10 * 1000;

export async function puppeteerAgentForTarget(
  target: MidsceneYamlScriptEnv,
  preference?: {
    headed?: boolean;
    keepWindow?: boolean;
    testId?: string;
  },
) {
  assert(target.url, 'url is required');

  const freeFn: {
    name: string;
    fn: () => void;
  }[] = [];

  // prepare the environment
  const ua = target.userAgent || defaultUA;
  let width = defaultViewportWidth;
  if (target.viewportWidth) {
    assert(
      typeof target.viewportWidth === 'number',
      'viewportWidth must be a number',
    );
    width = Number.parseInt(target.viewportWidth as unknown as string, 10);
    assert(width > 0, `viewportWidth must be greater than 0, but got ${width}`);
  }
  let height = defaultViewportHeight;
  if (target.viewportHeight) {
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
  // launch the browser
  if (headed && process.env.CI === '1') {
    console.warn(
      'you are probably running headed mode in CI, this will usually fail.',
    );
  }
  const puppeteer = await import('puppeteer');
  // do not use 'no-sandbox' on windows https://www.perplexity.ai/search/how-to-solve-this-with-nodejs-dMHpdCypRa..JA8TkQzbeQ
  const isWindows = process.platform === 'win32';
  const browser = await puppeteer.launch({
    headless: !headed,
    args: [
      ...(isWindows ? [] : ['--no-sandbox', '--disable-setuid-sandbox']),
      '--disable-features=PasswordLeakDetection',
      '--disable-save-password-bubble',
      '--start-maximized',
      `--window-size=${width},${height}`,
    ],
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
  await page.setUserAgent(ua);
  await page.setViewport(viewportConfig);

  if (target.cookie) {
    const cookieFileContent = readFileSync(target.cookie, 'utf-8');
    await page.setCookie(...JSON.parse(cookieFileContent));
  }

  await page.goto(target.url);
  const waitForNetworkIdleTimeout =
    typeof target.waitForNetworkIdle?.timeout === 'number'
      ? target.waitForNetworkIdle.timeout
      : defaultWaitForNetworkIdleTimeout;
  try {
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

  // prepare Midscene agent
  const agent = new PuppeteerAgent(page, {
    autoPrintReportMsg: false,
    testId: preference?.testId,
  });

  freeFn.push({
    name: 'midscene_puppeteer_agent',
    fn: () => agent.destroy(),
  });

  return { agent, freeFn };
}
