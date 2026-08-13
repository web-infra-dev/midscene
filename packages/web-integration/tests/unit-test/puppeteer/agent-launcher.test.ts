import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  defaultViewportHeight,
  defaultViewportWidth,
  launchPuppeteerPage,
  puppeteerAgentForTarget,
} from '@/puppeteer/agent-launcher';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import type { Browser, Page } from 'puppeteer';

const { mockLaunch } = rs.hoisted(() => ({
  mockLaunch: rs.fn(),
}));

const mockNewPage = rs.fn();
const browserContextMock = {
  setCookie: rs.fn().mockResolvedValue(undefined),
};
let pageMock: ReturnType<typeof createPageMock>;
const browserMock = {
  newPage: mockNewPage,
  on: rs.fn(),
  off: rs.fn(),
  close: rs.fn(),
};

const createPageMock = () => ({
  setUserAgent: rs.fn().mockResolvedValue(undefined),
  setExtraHTTPHeaders: rs.fn().mockResolvedValue(undefined),
  setViewport: rs.fn().mockResolvedValue(undefined),
  evaluateOnNewDocument: rs.fn().mockResolvedValue({ identifier: 'preload' }),
  removeScriptToEvaluateOnNewDocument: rs.fn().mockResolvedValue(undefined),
  goto: rs.fn().mockResolvedValue(undefined),
  waitForNetworkIdle: rs.fn().mockResolvedValue(undefined),
  close: rs.fn().mockResolvedValue(undefined),
  browser: rs.fn(() => browserMock),
  browserContext: rs.fn(() => browserContextMock),
  bringToFront: rs.fn().mockResolvedValue(undefined),
  on: rs.fn(),
  isClosed: rs.fn().mockReturnValue(false),
});

rs.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: mockLaunch },
  launch: mockLaunch,
}));

describe('launchPuppeteerPage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockLaunch.mockResolvedValue(browserMock);
    pageMock = createPageMock();
    mockNewPage.mockResolvedValue(pageMock as unknown as Page);
  });

  it('uses default viewport window size for headed runs', async () => {
    await launchPuppeteerPage({ url: 'https://example.com' }, { headed: true });

    const args = mockLaunch.mock.calls[0][0].args;
    expect(args).toContain(
      `--window-size=${defaultViewportWidth},${defaultViewportHeight + 100}`,
    );
    expect(args).not.toContain('--start-maximized');
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ defaultViewport: null }),
    );
    expect(pageMock.setViewport).toHaveBeenCalledWith({
      width: defaultViewportWidth,
      height: defaultViewportHeight,
      deviceScaleFactor: 0,
    });
  });

  it('respects provided viewport dimensions for headed runs', async () => {
    await launchPuppeteerPage(
      {
        url: 'https://example.com',
        viewportWidth: 1000,
        viewportHeight: 700,
      },
      { headed: true },
    );

    const args = mockLaunch.mock.calls[0][0].args;
    expect(args).toContain('--window-size=1000,800');
    expect(args).not.toContain('--start-maximized');
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ defaultViewport: null }),
    );
    expect(pageMock.setViewport).toHaveBeenCalledWith({
      width: 1000,
      height: 700,
      deviceScaleFactor: 0,
    });
  });

  it('preserves fractional deviceScaleFactor without truncating to integer', async () => {
    await launchPuppeteerPage({
      url: 'https://example.com',
      deviceScaleFactor: 1.5,
    });

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultViewport: expect.objectContaining({ deviceScaleFactor: 1.5 }),
      }),
    );
  });

  it('rejects deviceScaleFactor=0', async () => {
    await expect(
      launchPuppeteerPage({
        url: 'https://example.com',
        deviceScaleFactor: 0,
      }),
    ).rejects.toThrow(/deviceScaleFactor must be > 0/);
  });

  it('applies extraHTTPHeaders to the page when provided', async () => {
    const headers = {
      'X-Custom-Token': 'my-token',
      'Accept-Language': 'en-US',
    };
    await launchPuppeteerPage({
      url: 'https://example.com',
      extraHTTPHeaders: headers,
    });

    expect(pageMock.setExtraHTTPHeaders).toHaveBeenCalledWith(headers);
  });

  it('normalizes non-string extraHTTPHeaders values to strings', async () => {
    await launchPuppeteerPage({
      url: 'https://example.com',
      // YAML may yield booleans/numbers for unquoted values
      extraHTTPHeaders: {
        'X-Flag': true,
        'X-Num': 123,
      } as unknown as Record<string, string>,
    });

    expect(pageMock.setExtraHTTPHeaders).toHaveBeenCalledWith({
      'X-Flag': 'true',
      'X-Num': '123',
    });
  });

  it('does not set extraHTTPHeaders when not provided', async () => {
    await launchPuppeteerPage({ url: 'https://example.com' });

    expect(pageMock.setExtraHTTPHeaders).not.toHaveBeenCalled();
  });

  it('sets cookie files on the active page browser context', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'midscene-cookie-context-'));
    const cookieFile = path.join(root, 'cookies.json');
    const cookies = [
      {
        name: 'session',
        value: 'isolated-context',
        domain: 'example.com',
      },
    ];
    writeFileSync(cookieFile, JSON.stringify(cookies));

    try {
      await launchPuppeteerPage(
        { url: 'https://example.com', cookie: cookieFile },
        undefined,
        browserMock as any,
        pageMock as any,
      );

      expect(pageMock.browserContext).toHaveBeenCalledTimes(1);
      expect(browserContextMock.setCookie).toHaveBeenCalledWith(...cookies);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('configures Chrome download behavior when downloadPath is provided', async () => {
    await launchPuppeteerPage({
      url: 'https://example.com',
      downloadPath: './downloads',
    });

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadBehavior: {
          policy: 'allow',
          downloadPath: path.resolve('./downloads'),
        },
      }),
    );
  });

  it('does not configure Chrome download behavior when downloadPath is omitted', async () => {
    await launchPuppeteerPage({ url: 'https://example.com' });

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadBehavior: undefined,
      }),
    );
  });

  it('builds Chrome download behavior from a relative downloadPath', async () => {
    const { buildDownloadBehavior } = await import(
      '@/puppeteer/agent-launcher'
    );

    expect(buildDownloadBehavior('./downloads')).toEqual({
      policy: 'allow',
      downloadPath: path.resolve('./downloads'),
    });
  });

  it('does not build Chrome download behavior when downloadPath is omitted', async () => {
    const { buildDownloadBehavior } = await import(
      '@/puppeteer/agent-launcher'
    );

    expect(buildDownloadBehavior(undefined)).toBeUndefined();
  });

  it('does not configure Chrome download behavior on an externally provided browser', async () => {
    await launchPuppeteerPage(
      {
        url: 'https://example.com',
        downloadPath: './downloads',
      },
      undefined,
      browserMock as unknown as Browser,
    );

    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('does not configure Chrome download behavior on an externally provided page', async () => {
    await launchPuppeteerPage(
      {
        url: 'https://example.com',
        downloadPath: './downloads',
      },
      undefined,
      browserMock as unknown as Browser,
      pageMock as unknown as Page,
    );

    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('does not install a sessionStorage preload when reusing a browser context', async () => {
    await launchPuppeteerPage(
      { url: 'https://example.com' },
      undefined,
      browserMock as unknown as Browser,
      pageMock as unknown as Page,
    );

    expect(pageMock.evaluateOnNewDocument).not.toHaveBeenCalled();
    expect(pageMock.removeScriptToEvaluateOnNewDocument).not.toHaveBeenCalled();
  });

  it('propagates navigation errors instead of treating them as network-idle failures', async () => {
    const navigationError = new Error('net::ERR_NAME_NOT_RESOLVED');
    pageMock.goto.mockRejectedValueOnce(navigationError);

    await expect(
      launchPuppeteerPage(
        { url: 'https://example.invalid' },
        undefined,
        browserMock as unknown as Browser,
        pageMock as unknown as Page,
      ),
    ).rejects.toBe(navigationError);

    expect(pageMock.waitForNetworkIdle).not.toHaveBeenCalled();
  });

  it('closes an internally launched browser when navigation fails', async () => {
    const navigationError = new Error('net::ERR_NAME_NOT_RESOLVED');
    pageMock.goto.mockRejectedValueOnce(navigationError);

    await expect(
      launchPuppeteerPage({ url: 'https://example.invalid' }),
    ).rejects.toBe(navigationError);

    expect(browserMock.close).toHaveBeenCalledTimes(1);
  });

  it('closes a page created in a caller-provided browser when navigation fails', async () => {
    const navigationError = new Error('net::ERR_NAME_NOT_RESOLVED');
    pageMock.goto.mockRejectedValueOnce(navigationError);

    await expect(
      launchPuppeteerPage(
        { url: 'https://example.invalid' },
        undefined,
        browserMock as unknown as Browser,
      ),
    ).rejects.toBe(navigationError);

    expect(pageMock.close).toHaveBeenCalledTimes(1);
    expect(browserMock.close).not.toHaveBeenCalled();
  });

  it('only applies continueOnNetworkIdleError to network-idle failures', async () => {
    pageMock.waitForNetworkIdle.mockRejectedValueOnce(
      new Error('network remained busy'),
    );

    await expect(
      launchPuppeteerPage(
        {
          url: 'https://example.com',
          waitForNetworkIdle: { continueOnNetworkIdleError: true },
        },
        undefined,
        browserMock as unknown as Browser,
        pageMock as unknown as Page,
      ),
    ).resolves.toMatchObject({ page: pageMock });

    pageMock.waitForNetworkIdle.mockRejectedValueOnce(
      new Error('network remained busy'),
    );
    await expect(
      launchPuppeteerPage(
        {
          url: 'https://example.com',
          waitForNetworkIdle: { continueOnNetworkIdleError: false },
        },
        undefined,
        browserMock as unknown as Browser,
        pageMock as unknown as Page,
      ),
    ).rejects.toThrow('failed to wait for network idle');
  });

  it('passes yaml waitForNetworkIdle settings to the agent for later actions', async () => {
    const { agent } = await puppeteerAgentForTarget({
      url: 'https://example.com',
      forceSameTabNavigation: false,
      waitForNetworkIdle: {
        timeout: 4321,
        continueOnNetworkIdleError: false,
      },
    });

    expect(
      (agent.page as unknown as { waitForNetworkIdleTimeout: number })
        .waitForNetworkIdleTimeout,
    ).toBe(4321);
  });

  it('requires browser mode for autoFollowNewPage', async () => {
    await expect(
      puppeteerAgentForTarget({
        url: 'https://example.com',
        autoFollowNewPage: true,
      }),
    ).rejects.toThrow('autoFollowNewPage requires browser mode');

    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('creates browser agent in browser mode', async () => {
    const { agent } = await puppeteerAgentForTarget({
      mode: 'browser',
      url: 'https://example.com',
      autoFollowNewPage: true,
    });

    expect(agent.constructor.name).toBe('PuppeteerBrowserAgent');
    expect(browserMock.on).toHaveBeenCalledWith(
      'targetcreated',
      expect.any(Function),
    );
  });

  it('rejects forceSameTabNavigation in browser mode', async () => {
    await expect(
      puppeteerAgentForTarget({
        mode: 'browser',
        url: 'https://example.com',
        forceSameTabNavigation: false,
      }),
    ).rejects.toThrow('forceSameTabNavigation cannot be used in browser mode');
  });
});
