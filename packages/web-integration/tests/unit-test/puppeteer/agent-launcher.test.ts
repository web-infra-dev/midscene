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

const createPageMock = () => ({
  setUserAgent: vi.fn().mockResolvedValue(undefined),
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
