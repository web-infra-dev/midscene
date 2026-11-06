import { PuppeteerBrowserAgent } from '@/puppeteer/browser-agent';
import { PuppeteerPageAgent } from '@/puppeteer/page-agent';
import {
  gotoUrlInputSchema,
  puppeteerAgentTestRunnerNodeDefinitions,
  setCookiesInputSchema,
  setViewportSizeInputSchema,
} from '@/puppeteer/test-runner';
import { describe, expect, it, rs } from '@rstest/core';
import type { Page } from 'puppeteer';

const node = (name: string) => {
  const definition = puppeteerAgentTestRunnerNodeDefinitions.find(
    (candidate) => candidate.name === name,
  );
  if (!definition) throw new Error(`Missing Puppeteer Node ${name}.`);
  return definition;
};

describe('Puppeteer test runner entry', () => {
  it('exposes common and browser Nodes on both Agent classes', () => {
    for (const agentClass of [PuppeteerPageAgent, PuppeteerBrowserAgent]) {
      const names = agentClass
        .getTestRunnerNodeDefinitions()
        .map(({ name }) => name);
      expect(names).toEqual(
        expect.arrayContaining([
          'aiAct',
          'aiTap',
          'gotoUrl',
          'setCookies',
          'clearCookies',
          'setViewportSize',
        ]),
      );
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('exports platform definitions without initializing a browser', () => {
    expect(
      puppeteerAgentTestRunnerNodeDefinitions.map(({ name }) => name),
    ).toEqual(['gotoUrl', 'setCookies', 'clearCookies', 'setViewportSize']);
    expect(
      gotoUrlInputSchema.parse({ url: 'https://example.com' }).waitUntil,
    ).toBe('domcontentloaded');
  });

  it('rejects agents without a Puppeteer page', async () => {
    await expect(
      node('gotoUrl').execute(
        {},
        { url: 'https://example.com' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('must return a Puppeteer Agent');
  });

  it('navigates relative to configured baseURL', async () => {
    const goto = rs.fn().mockResolvedValue({ status: () => 204 });
    const page = {
      goto,
      url: rs.fn().mockReturnValue('https://example.com/orders'),
      title: rs.fn().mockResolvedValue('Orders'),
    } as unknown as Page;
    const result = await node('gotoUrl').execute(
      {
        interface: { underlyingPage: page },
        testRunner: { baseURL: 'https://example.com/app/' },
      },
      gotoUrlInputSchema.parse({ url: '../orders' }),
      { signal: new AbortController().signal },
    );

    expect(goto).toHaveBeenCalledWith('https://example.com/orders', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(result).toBeDefined();
    if (!result) throw new Error('gotoUrl returned no result.');
    expect(result.data).toEqual({
      url: 'https://example.com/orders',
      status: 204,
      title: 'Orders',
    });
  });

  it('maps portable networkidle navigation to Puppeteer networkidle0', async () => {
    const goto = rs.fn().mockResolvedValue(null);
    const page = {
      goto,
      url: rs.fn().mockReturnValue('https://example.com/ready'),
      title: rs.fn().mockResolvedValue('Ready'),
    } as unknown as Page;
    await node('gotoUrl').execute(
      { interface: { underlyingPage: page } },
      gotoUrlInputSchema.parse({
        url: 'https://example.com/ready',
        waitUntil: 'networkidle',
      }),
      { signal: new AbortController().signal },
    );

    expect(goto).toHaveBeenCalledWith('https://example.com/ready', {
      waitUntil: 'networkidle0',
      timeout: 60_000,
    });
  });

  it('reports the Playwright-only commit lifecycle explicitly', async () => {
    const page = {
      url: rs.fn().mockReturnValue('about:blank'),
    } as unknown as Page;
    await expect(
      node('gotoUrl').execute(
        { interface: { underlyingPage: page } },
        gotoUrlInputSchema.parse({
          url: 'https://example.com',
          waitUntil: 'commit',
        }),
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('Puppeteer does not support');
  });

  it('sets cookies without exposing their values in the result', async () => {
    const setCookie = rs.fn().mockResolvedValue(undefined);
    const page = { setCookie } as unknown as Page;
    const result = await node('setCookies').execute(
      {
        interface: { underlyingPage: page },
        testRunner: {
          getEnv: () => ({ TEST_COOKIE: 'session=secret' }),
        },
      },
      setCookiesInputSchema.parse({
        cookiesEnv: 'TEST_COOKIE',
        url: 'https://example.com',
      }),
      { signal: new AbortController().signal },
    );

    expect(setCookie).toHaveBeenCalledWith({
      name: 'session',
      value: 'secret',
      url: 'https://example.com/',
    });
    expect(result).toBeDefined();
    if (!result) throw new Error('setCookies returned no result.');
    expect(result.data).toEqual({
      source: 'env',
      sourceName: 'TEST_COOKIE',
      count: 1,
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('clears only cookies matching all supplied filters', async () => {
    const deleteCookie = rs.fn().mockResolvedValue(undefined);
    const browserContext = {
      cookies: rs.fn().mockResolvedValue([
        { name: 'session', value: 'a', domain: '.example.com', path: '/' },
        { name: 'theme', value: 'dark', domain: '.example.com', path: '/' },
      ]),
      deleteCookie,
    };
    const page = {
      browserContext: () => browserContext,
    } as unknown as Page;
    const result = await node('clearCookies').execute(
      { interface: { underlyingPage: page } },
      { name: 'session', domain: '.example.com' },
      { signal: new AbortController().signal },
    );

    expect(deleteCookie).toHaveBeenCalledWith({
      name: 'session',
      value: 'a',
      domain: '.example.com',
      path: '/',
    });
    expect(result).toBeDefined();
    if (!result) throw new Error('clearCookies returned no result.');
    expect(result.data).toEqual({
      filters: { name: 'session', domain: '.example.com' },
    });
  });

  describe('legacy context cookie APIs', () => {
    const cookies = [
      { name: 'session', domain: 'other.example', path: '/' },
      { name: 'session', domain: 'other.example', path: '/admin' },
      { name: 'theme', domain: 'other.example', path: '/' },
      { name: 'session', domain: 'current.example', path: '/' },
      {
        name: 'partitioned',
        domain: 'other.example',
        path: '/',
        partitionKey: {
          topLevelSite: 'https://current.example',
          hasCrossSiteAncestor: true,
        },
      },
    ];

    const setup = () => {
      const session = {
        send: rs.fn().mockResolvedValue({ cookies }),
        detach: rs.fn().mockResolvedValue(undefined),
      };
      const execute = (filters = {}) =>
        node('clearCookies').execute(
          {
            interface: {
              underlyingPage: {
                browserContext: () => ({}),
                target: () => ({ createCDPSession: async () => session }),
              },
            },
          },
          filters,
          { signal: new AbortController().signal },
        );
      return { session, execute };
    };

    it('clears cookies from every origin and preserves partition identity', async () => {
      const { session, execute } = setup();
      await execute();
      expect(session.send).toHaveBeenCalledWith('Network.getAllCookies');
      for (const cookie of cookies) {
        expect(session.send).toHaveBeenCalledWith(
          'Network.deleteCookies',
          cookie,
        );
      }
      expect(session.send).toHaveBeenCalledTimes(cookies.length + 1);
      expect(session.detach).toHaveBeenCalledTimes(1);
    });

    it('requires every supplied filter to match', async () => {
      const { session, execute } = setup();
      await execute({
        name: 'session',
        domain: 'other.example',
        path: '/admin',
      });
      expect(session.send).toHaveBeenCalledTimes(2);
      expect(session.send).toHaveBeenCalledWith(
        'Network.deleteCookies',
        cookies[1],
      );
    });

    it('does not delete when no cookies match', async () => {
      const { session, execute } = setup();
      await execute({ name: 'missing' });
      expect(session.send).toHaveBeenCalledTimes(1);
      expect(session.detach).toHaveBeenCalledTimes(1);
    });

    it.each(['Network.getAllCookies', 'Network.deleteCookies'])(
      'detaches and propagates failures from %s',
      async (command) => {
        const { session, execute } = setup();
        session.send.mockImplementation(async (method) => {
          if (method === command) throw new Error('CDP failed');
          return { cookies };
        });
        await expect(execute()).rejects.toThrow('CDP failed');
        expect(session.detach).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('sets and returns the effective viewport size', async () => {
    const setViewport = rs.fn().mockResolvedValue(undefined);
    const page = {
      setViewport,
      viewport: () => ({ width: 1440, height: 900, deviceScaleFactor: 1 }),
    } as unknown as Page;
    const result = await node('setViewportSize').execute(
      { interface: { underlyingPage: page } },
      setViewportSizeInputSchema.parse({ width: 1440, height: 900 }),
      { signal: new AbortController().signal },
    );

    expect(setViewport).toHaveBeenCalledWith({ width: 1440, height: 900 });
    expect(result).toBeDefined();
    if (!result) throw new Error('setViewportSize returned no result.');
    expect(result.data).toEqual({ width: 1440, height: 900 });
  });
});
