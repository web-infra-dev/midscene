import type {
  WebTestDriver,
  WebTestDriverAdapter,
} from '@/common/test-runner/driver';
import type { CookieParam } from 'puppeteer';
import type {
  PuppeteerTestRunnerAgent,
  PuppeteerTestRunnerOptions,
} from './types';
import { requirePuppeteerAgent } from './utils';

const createPuppeteerDriver = (
  agent: PuppeteerTestRunnerAgent,
): WebTestDriver => {
  const page = agent.interface.underlyingPage;
  return {
    currentUrl: () => page.url(),
    baseUrl: () => undefined,
    async goto(url, options) {
      if (options.waitUntil === 'commit') {
        throw new TypeError(
          'Puppeteer does not support gotoUrl.waitUntil=commit; use domcontentloaded instead.',
        );
      }
      const response = await page.goto(url, {
        waitUntil:
          options.waitUntil === 'networkidle'
            ? 'networkidle0'
            : options.waitUntil,
        timeout: options.timeoutMs,
      });
      return { status: response?.status() ?? null };
    },
    title: () => page.title(),
    setCookies: async (cookies) => {
      await page.setCookie(
        ...cookies.map((cookie) => cookie as unknown as CookieParam),
      );
    },
    clearCookies: async (filters) => {
      const browserContext = page.browserContext();
      const matches = (cookie: {
        name: string;
        domain: string;
        path: string;
      }) =>
        (filters.name === undefined || cookie.name === filters.name) &&
        (filters.domain === undefined || cookie.domain === filters.domain) &&
        (filters.path === undefined || cookie.path === filters.path);
      if (
        typeof browserContext.cookies === 'function' &&
        typeof browserContext.deleteCookie === 'function'
      ) {
        const cookies = (await browserContext.cookies()).filter(matches);
        if (cookies.length > 0) await browserContext.deleteCookie(...cookies);
        return;
      }

      // Puppeteer <23.10 lacks context cookie APIs. A page-target CDP session
      // reads all cookies in that context, including origins not open in a tab.
      const session = await page.target().createCDPSession();
      try {
        const { cookies } = await session.send('Network.getAllCookies');
        for (const cookie of cookies.filter(matches)) {
          await session.send('Network.deleteCookies', {
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
            ...(cookie.partitionKey
              ? { partitionKey: cookie.partitionKey }
              : {}),
          });
        }
      } finally {
        await session.detach();
      }
    },
    setViewportSize: async (size) => {
      await page.setViewport(size);
      const viewport = page.viewport();
      if (!viewport) {
        throw new Error('Puppeteer did not report an effective viewport size.');
      }
      return { width: viewport.width, height: viewport.height };
    },
  };
};

export const puppeteerTestDriverAdapter: WebTestDriverAdapter<
  PuppeteerTestRunnerAgent,
  PuppeteerTestRunnerOptions
> = {
  requireAgent: requirePuppeteerAgent,
  createDriver: createPuppeteerDriver,
  getOptions: (agent) => agent.testRunner,
};
