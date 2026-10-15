import { puppeteerAgentTestRunnerNodeDefinitions } from '@/puppeteer/test-runner';
import { describe, expect, it } from '@rstest/core';
import puppeteer from 'puppeteer';

describe('clearCookies in Chromium', () => {
  it.each(['native', 'legacy'])(
    '%s APIs keep context-wide semantics',
    async (mode) => {
      const browser = await puppeteer.launch({ headless: true });
      try {
        const context = await browser.createBrowserContext();
        const otherContext = await browser.createBrowserContext();
        const page = await context.newPage();
        const otherPage = await otherContext.newPage();
        const cookies = [
          { name: 'session', value: 'a', domain: 'first.example', path: '/' },
          { name: 'session', value: 'b', domain: 'second.example', path: '/' },
          {
            name: 'session',
            value: 'c',
            domain: 'second.example',
            path: '/admin',
          },
          { name: 'theme', value: 'dark', domain: 'second.example', path: '/' },
        ];
        // Both pages stay at about:blank: none of these origins has an open tab.
        await page.setCookie(...cookies);
        await otherPage.setCookie(...cookies);
        const definition = puppeteerAgentTestRunnerNodeDefinitions.find(
          (node) => node.name === 'clearCookies',
        );
        if (!definition) throw new Error('Missing clearCookies Node');
        const underlyingPage =
          mode === 'native'
            ? page
            : {
                browserContext: () => ({}),
                target: () => page.target(),
              };
        const execute = (filters: Record<string, string>) =>
          definition.execute({ interface: { underlyingPage } }, filters, {
            signal: new AbortController().signal,
          });
        await execute({
          name: 'session',
          domain: 'second.example',
          path: '/admin',
        });
        expect(
          (await context.cookies()).map(({ value }) => value).sort(),
        ).toEqual(['a', 'b', 'dark']);
        await execute({});
        expect(await context.cookies()).toEqual([]);
        expect(await otherContext.cookies()).toHaveLength(cookies.length);
      } finally {
        await browser.close();
      }
    },
  );
});
