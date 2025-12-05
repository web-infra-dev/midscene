import { readFileSync } from 'node:fs';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';

import { PuppeteerAgent } from '@/puppeteer/index';
import type { AgentOpt, Cache, MidsceneYamlScriptWebEnv } from '@midscene/core';
import { DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT } from '@midscene/shared/constants';
import puppeteer, { type Browser } from 'puppeteer';

export const defaultUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
export const defaultViewportWidth = 1440;
export const defaultViewportHeight = 768;
export const defaultViewportScale = process.platform === 'darwin' ? 2 : 1;
export const defaultWaitForNetworkIdleTimeout =
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT;

export function resolveAiActionContext(
  target: MidsceneYamlScriptWebEnv,
  preference?: Partial<Pick<AgentOpt, 'aiActionContext'>>,
): AgentOpt['aiActionContext'] | undefined {
  // Prefer the web target override if provided; otherwise fall back to agent-level preference.
  return target.aiActionContext ?? preference?.aiActionContext;
}

/**
 * Chrome arguments that may reduce browser security.
 * These should only be used in controlled testing environments.
 *
 * Security implications:
 * - `--no-sandbox`: Disables Chrome's sandbox security model
 * - `--disable-setuid-sandbox`: Disables setuid sandbox on Linux
 * - `--disable-web-security`: Allows cross-origin requests without CORS
 * - `--ignore-certificate-errors`: Ignores SSL/TLS certificate errors
 * - `--disable-features=IsolateOrigins`: Disables origin isolation
 * - `--disable-site-isolation-trials`: Disables site isolation
 * - `--allow-running-insecure-content`: Allows mixed HTTP/HTTPS content
 */
const DANGEROUS_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-web-security',
  '--ignore-certificate-errors',
  '--disable-features=IsolateOrigins',
  '--disable-site-isolation-trials',
  '--allow-running-insecure-content',
] as const;

/**
 * Validates Chrome launch arguments for security concerns.
 * Emits a warning if dangerous arguments are detected.
 *
 * This function filters out arguments that are already present in baseArgs
 * to avoid warning about platform-specific defaults (e.g., --no-sandbox on non-Windows).
 *
 * @param args - Chrome launch arguments to validate
 * @param baseArgs - Base Chrome arguments already configured
 *
 * @example
 * ```typescript
 * // Will show warning for --disable-web-security
 * validateChromeArgs(['--disable-web-security', '--headless'], ['--no-sandbox']);
 *
 * // Will NOT show warning for --no-sandbox (already in baseArgs)
 * validateChromeArgs(['--no-sandbox'], ['--no-sandbox', '--headless']);
 * ```
 */
function validateChromeArgs(args: string[], baseArgs: string[]): void {
  // Filter out arguments that are already in baseArgs
  const newArgs = args.filter(
    (arg) =>
      !baseArgs.some((baseArg) => {
        // Check if arg starts with the same flag as baseArg (before '=' if present)
        const argFlag = arg.split('=')[0];
        const baseFlag = baseArg.split('=')[0];
        return argFlag === baseFlag;
      }),
  );

  const dangerousArgs = newArgs.filter((arg) =>
    DANGEROUS_ARGS.some((dangerous) => arg.startsWith(dangerous)),
  );

  if (dangerousArgs.length > 0) {
    console.warn(
      `Warning: Dangerous Chrome arguments detected: ${dangerousArgs.join(', ')}.\nThese arguments may reduce browser security. Use only in controlled testing environments.`,
    );
  }
}

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
  browser?: Browser,
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

  const baseArgs = [
    ...(isWindows ? [] : ['--no-sandbox', '--disable-setuid-sandbox']),
    '--disable-features=HttpsFirstBalancedModeAutoEnable',
    '--disable-features=PasswordLeakDetection',
    '--disable-save-password-bubble',
    `--user-agent="${ua}"`,
    preferMaximizedWindow
      ? '--start-maximized'
      : `--window-size=${width},${height + 200}`, // add 200px for the address bar
  ];

  // Merge custom Chrome arguments
  let args = baseArgs;
  if (target.chromeArgs && target.chromeArgs.length > 0) {
    validateChromeArgs(target.chromeArgs, baseArgs);

    // Custom args come after base args, allowing them to override defaults
    args = [...baseArgs, ...target.chromeArgs];
    launcherDebug(
      'Merging custom Chrome arguments',
      target.chromeArgs,
      'Final args',
      args,
    );
  }

  launcherDebug(
    'launching browser with viewport, headed',
    headed,
    'viewport',
    viewportConfig,
    'args',
    args,
    'preference',
    preference,
  );
  let browserInstance = browser;
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: !preference?.headed,
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
              browserInstance?.close();
            }, 800);
          } else {
            browserInstance?.close();
          }
        }
      },
    });
  }
  const page = await browserInstance.newPage();

  if (target.cookie) {
    const cookieFileContent = readFileSync(target.cookie, 'utf-8');
    await browserInstance.setCookie(...JSON.parse(cookieFileContent));
  }

  if (ua) {
    await page.setUserAgent(ua);
  }

  if (viewportConfig) {
    await page.setViewport(viewportConfig);
  }

  const waitForNetworkIdleTimeout =
    typeof target.waitForNetworkIdle?.timeout === 'number'
      ? target.waitForNetworkIdle.timeout
      : defaultWaitForNetworkIdleTimeout;

  try {
    launcherDebug('goto', target.url);
    await page.goto(target.url);
    if (waitForNetworkIdleTimeout > 0) {
      launcherDebug('waitForNetworkIdle', waitForNetworkIdleTimeout);
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
  } & Partial<
    Pick<
      AgentOpt,
      | 'testId'
      | 'groupName'
      | 'groupDescription'
      | 'generateReport'
      | 'autoPrintReportMsg'
      | 'reportFileName'
      | 'replanningCycleLimit'
      | 'cache'
      | 'aiActionContext'
    >
  >,
  browser?: Browser,
) {
  const { page, freeFn } = await launchPuppeteerPage(
    target,
    preference,
    browser,
  );
  const aiActionContext = resolveAiActionContext(target, preference);

  // prepare Midscene agent
  const agent = new PuppeteerAgent(page, {
    ...preference,
    aiActionContext,
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
