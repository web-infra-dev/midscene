import path from 'node:path';
import {
  type SessionStorageSnapshot,
  captureSessionStorageSnapshot,
  defaultViewportHeight,
  defaultViewportWidth,
  launchPuppeteerPage,
  puppeteerAgentForTarget,
} from '@/puppeteer/agent-launcher';
import type { Browser, Page } from 'puppeteer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLaunch } = vi.hoisted(() => ({
  mockLaunch: vi.fn(),
}));

const mockNewPage = vi.fn();
let pageMock: ReturnType<typeof createPageMock>;
const browserMock = {
  newPage: mockNewPage,
  on: vi.fn(),
  off: vi.fn(),
  setCookie: vi.fn(),
  close: vi.fn(),
};

const createPageMock = () => ({
  setUserAgent: vi.fn().mockResolvedValue(undefined),
  setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
  setViewport: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue(undefined),
  evaluateOnNewDocument: vi
    .fn()
    .mockResolvedValue({ identifier: 'session-storage-restore' }),
  removeScriptToEvaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
  browser: vi.fn(() => browserMock),
  bringToFront: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  isClosed: vi.fn().mockReturnValue(false),
});

vi.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: mockLaunch },
  launch: mockLaunch,
}));

describe('launchPuppeteerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

  it('restores setup sessionStorage before the first navigation and removes the preload afterward', async () => {
    const snapshot: SessionStorageSnapshot = {
      origin: 'https://example.com',
      entries: [
        ['sessionId', 'setup-session'],
        ['csrfToken', 'setup-csrf'],
      ],
    };

    await launchPuppeteerPage(
      { url: 'https://example.com' },
      undefined,
      browserMock as unknown as Browser,
      pageMock as unknown as Page,
      snapshot,
    );

    expect(pageMock.evaluateOnNewDocument).toHaveBeenCalledWith(
      expect.any(Function),
      snapshot,
    );
    expect(
      pageMock.evaluateOnNewDocument.mock.invocationCallOrder[0],
    ).toBeLessThan(pageMock.goto.mock.invocationCallOrder[0]);
    expect(pageMock.removeScriptToEvaluateOnNewDocument).toHaveBeenCalledWith(
      'session-storage-restore',
    );
    expect(pageMock.goto.mock.invocationCallOrder[0]).toBeLessThan(
      pageMock.removeScriptToEvaluateOnNewDocument.mock.invocationCallOrder[0],
    );

    const setItem = vi.fn();
    vi.stubGlobal('window', {
      location: { origin: 'https://example.com' },
      sessionStorage: { setItem },
    });
    const restoreSessionStorage = pageMock.evaluateOnNewDocument.mock
      .calls[0][0] as (value: SessionStorageSnapshot) => void;
    restoreSessionStorage(snapshot);
    expect(setItem.mock.calls).toEqual(snapshot.entries);

    setItem.mockClear();
    vi.stubGlobal('window', {
      location: { origin: 'https://other.example.com' },
      sessionStorage: { setItem },
    });
    restoreSessionStorage(snapshot);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not install a sessionStorage preload without a setup snapshot', async () => {
    await launchPuppeteerPage(
      { url: 'https://example.com' },
      undefined,
      browserMock as unknown as Browser,
      pageMock as unknown as Page,
    );

    expect(pageMock.evaluateOnNewDocument).not.toHaveBeenCalled();
    expect(pageMock.removeScriptToEvaluateOnNewDocument).not.toHaveBeenCalled();
  });

  it('captures setup sessionStorage with its current origin', async () => {
    pageMock.evaluate = vi.fn().mockResolvedValue({
      origin: 'https://example.com',
      entries: [['sessionId', 'setup-session']],
    });

    await expect(
      captureSessionStorageSnapshot(pageMock as unknown as Page),
    ).resolves.toEqual({
      origin: 'https://example.com',
      entries: [['sessionId', 'setup-session']],
    });
  });

  it('rejects sessionStorage capture from a closed page or opaque origin', async () => {
    pageMock.isClosed.mockReturnValueOnce(true);
    await expect(
      captureSessionStorageSnapshot(pageMock as unknown as Page),
    ).rejects.toThrow('The setup page was closed');

    pageMock.isClosed.mockReturnValue(false);
    pageMock.evaluate = vi.fn().mockResolvedValue({
      origin: 'null',
      entries: [],
    });
    await expect(
      captureSessionStorageSnapshot(pageMock as unknown as Page),
    ).rejects.toThrow('The setup page has an opaque origin');
  });

  it('adds context when setup sessionStorage capture fails', async () => {
    pageMock.evaluate.mockRejectedValueOnce(
      new Error('Execution context lost'),
    );

    await expect(
      captureSessionStorageSnapshot(pageMock as unknown as Page),
    ).rejects.toThrow('Failed to capture sessionStorage from the setup page');
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
        { origin: 'https://example.invalid', entries: [] },
      ),
    ).rejects.toBe(navigationError);

    expect(pageMock.waitForNetworkIdle).not.toHaveBeenCalled();
    expect(pageMock.removeScriptToEvaluateOnNewDocument).toHaveBeenCalledWith(
      'session-storage-restore',
    );
  });

  it('preserves a navigation error when preload cleanup also fails', async () => {
    const navigationError = new Error('navigation failed');
    pageMock.goto.mockRejectedValueOnce(navigationError);
    pageMock.removeScriptToEvaluateOnNewDocument.mockRejectedValueOnce(
      new Error('cleanup failed'),
    );

    await expect(
      launchPuppeteerPage(
        { url: 'https://example.com' },
        undefined,
        browserMock as unknown as Browser,
        pageMock as unknown as Page,
        { origin: 'https://example.com', entries: [] },
      ),
    ).rejects.toBe(navigationError);
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

  it('throws a contextual error when preload cleanup fails after navigation succeeds', async () => {
    pageMock.removeScriptToEvaluateOnNewDocument.mockRejectedValueOnce(
      new Error('CDP session closed'),
    );

    await expect(
      launchPuppeteerPage(
        { url: 'https://example.com' },
        undefined,
        browserMock as unknown as Browser,
        pageMock as unknown as Page,
        { origin: 'https://example.com', entries: [] },
      ),
    ).rejects.toThrow('failed to remove the sessionStorage preload');
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
