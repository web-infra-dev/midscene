import type {
  WebCookieFilters,
  WebTestDriver,
  WebTestDriverAdapter,
} from '@/common/test-runner/driver';
import type { BrowserContext } from 'playwright';
import type {
  PlaywrightTestRunnerAgent,
  PlaywrightTestRunnerOptions,
} from './types';
import { requirePlaywrightAgent } from './utils';

type CookieClearOptions = NonNullable<
  Parameters<BrowserContext['clearCookies']>[0]
>;

const createPlaywrightDriver = (
  agent: PlaywrightTestRunnerAgent,
): WebTestDriver => {
  const page = agent.interface.underlyingPage;
  return {
    currentUrl: () => page.url(),
    baseUrl: () => {
      const context = page.context() as BrowserContext & {
        _options?: { baseURL?: string };
      };
      return context._options?.baseURL;
    },
    async goto(url, options) {
      if (
        options.waitUntil === 'networkidle0' ||
        options.waitUntil === 'networkidle2'
      ) {
        throw new TypeError(
          `Playwright does not support gotoUrl.waitUntil=${options.waitUntil}; use networkidle instead.`,
        );
      }
      const response = await page.goto(url, {
        waitUntil: options.waitUntil,
        timeout: options.timeoutMs,
      });
      return { status: response?.status() ?? null };
    },
    title: () => page.title(),
    setCookies: async (cookies) => {
      await page.context().addCookies(cookies);
    },
    clearCookies: async (filters: WebCookieFilters) => {
      await page.context().clearCookies(filters as CookieClearOptions);
    },
    setViewportSize: async (size) => {
      await page.setViewportSize(size);
      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error(
          'Playwright did not report an effective viewport size.',
        );
      }
      return viewport;
    },
  };
};

export const playwrightTestDriverAdapter: WebTestDriverAdapter<
  PlaywrightTestRunnerAgent,
  PlaywrightTestRunnerOptions
> = {
  requireAgent: requirePlaywrightAgent,
  createDriver: createPlaywrightDriver,
  getOptions: (agent) => agent.testRunner,
};
