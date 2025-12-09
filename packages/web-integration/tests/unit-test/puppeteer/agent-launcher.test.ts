import {
  defaultViewportHeight,
  defaultViewportWidth,
  launchPuppeteerPage,
} from '@/puppeteer/agent-launcher';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLaunch } = vi.hoisted(() => ({
  mockLaunch: vi.fn(),
}));

const mockNewPage = vi.fn();
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
    const page = createPageMock();
    mockNewPage.mockResolvedValue(page as any);
  });

  it('uses default viewport window size for headed runs', async () => {
    await launchPuppeteerPage({ url: 'https://example.com' }, { headed: true });

    const args = mockLaunch.mock.calls[0][0].args;
    expect(args).toContain(
      `--window-size=${defaultViewportWidth},${defaultViewportHeight + 200}`,
    );
    expect(args).not.toContain('--start-maximized');
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ defaultViewport: null }),
    );
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
    expect(args).toContain('--window-size=1000,900');
    expect(args).not.toContain('--start-maximized');
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ defaultViewport: null }),
    );
  });
});
