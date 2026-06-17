import path from 'node:path';
import {
  defaultViewportHeight,
  defaultViewportWidth,
  launchPuppeteerPage,
  puppeteerAgentForTarget,
} from '@/puppeteer/agent-launcher';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLaunch } = vi.hoisted(() => ({
  mockLaunch: vi.fn(),
}));

const mockNewPage = vi.fn();
let pageMock: ReturnType<typeof createPageMock>;
const browserMock = {
  newPage: mockNewPage,
  setCookie: vi.fn(),
  close: vi.fn(),
};

const cdpSessionMock = {
  send: vi.fn().mockResolvedValue(undefined),
  detach: vi.fn().mockResolvedValue(undefined),
};

const createPageMock = () => ({
  createCDPSession: vi.fn().mockResolvedValue(cdpSessionMock),
  setUserAgent: vi.fn().mockResolvedValue(undefined),
  setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
  setViewport: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
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
    mockLaunch.mockResolvedValue(browserMock);
    pageMock = createPageMock();
    mockNewPage.mockResolvedValue(pageMock as any);
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
      extraHTTPHeaders: { 'X-Flag': true, 'X-Num': 123 } as any,
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

    expect(pageMock.createCDPSession).toHaveBeenCalled();
    expect(cdpSessionMock.send).toHaveBeenCalledWith(
      'Browser.setDownloadBehavior',
      {
        behavior: 'allow',
        downloadPath: path.resolve('./downloads'),
      },
    );
    expect(cdpSessionMock.detach).not.toHaveBeenCalled();
  });

  it('does not configure Chrome download behavior when downloadPath is omitted', async () => {
    await launchPuppeteerPage({ url: 'https://example.com' });

    expect(pageMock.createCDPSession).not.toHaveBeenCalled();
    expect(cdpSessionMock.send).not.toHaveBeenCalled();
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

    expect((agent.page as any).waitForNetworkIdleTimeout).toBe(4321);
  });
});
