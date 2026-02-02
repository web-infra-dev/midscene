import { Page } from '@/puppeteer/base-page';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the sleep function to speed up tests
const { mockSleep } = vi.hoisted(() => ({
  mockSleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@midscene/core/utils', async () => {
  const actual = await vi.importActual('@midscene/core/utils');
  return {
    ...actual,
    sleep: mockSleep,
  };
});

describe('screenshotBase64 retry mechanism', () => {
  let mockPuppeteerPage: any;
  let page: Page<any, any, any>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSleep.mockClear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockPuppeteerPage = (screenshotFn: () => Promise<string>) => ({
    bringToFront: vi.fn().mockResolvedValue(undefined),
    screenshot: screenshotFn,
    evaluate: vi.fn().mockResolvedValue({}),
    url: vi.fn().mockReturnValue('https://example.com'),
  });

  const getScreenshotWarnCalls = () => {
    return warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' && call[0].includes('Screenshot attempt'),
    );
  };

  it('should succeed on first attempt when no error occurs', async () => {
    const screenshotMock = vi.fn().mockResolvedValue('base64ImageData');
    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);

    page = new Page(mockPuppeteerPage, 'puppeteer');

    const result = await page.screenshotBase64();

    expect(screenshotMock).toHaveBeenCalledTimes(1);
    expect(result).toContain('base64ImageData');
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('should retry on CDP Internal error and succeed on second attempt', async () => {
    const cdpError = new Error(
      'Protocol error (Page.captureScreenshot): Internal error',
    );
    const screenshotMock = vi
      .fn()
      .mockRejectedValueOnce(cdpError)
      .mockResolvedValueOnce('base64ImageData');

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    const result = await page.screenshotBase64();

    expect(screenshotMock).toHaveBeenCalledTimes(2);
    expect(result).toContain('base64ImageData');
    const warnCalls = getScreenshotWarnCalls();
    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0][0]).toContain('Screenshot attempt 1/3 failed');
    // Should use exponential backoff: 500ms for first retry
    expect(mockSleep).toHaveBeenCalledWith(500);
  });

  it('should retry on CDP Internal error and succeed on third attempt', async () => {
    const cdpError = new Error(
      'Protocol error (Page.captureScreenshot): Internal error',
    );
    const screenshotMock = vi
      .fn()
      .mockRejectedValueOnce(cdpError)
      .mockRejectedValueOnce(cdpError)
      .mockResolvedValueOnce('base64ImageData');

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    const result = await page.screenshotBase64();

    expect(screenshotMock).toHaveBeenCalledTimes(3);
    expect(result).toContain('base64ImageData');
    const warnCalls = getScreenshotWarnCalls();
    expect(warnCalls.length).toBe(2);
    // Should use exponential backoff: 500ms, then 1000ms
    expect(mockSleep).toHaveBeenNthCalledWith(1, 500);
    expect(mockSleep).toHaveBeenNthCalledWith(2, 1000);
  });

  it('should throw error after all retries exhausted', async () => {
    const cdpError = new Error(
      'Protocol error (Page.captureScreenshot): Internal error',
    );
    const screenshotMock = vi.fn().mockRejectedValue(cdpError);

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    await expect(page.screenshotBase64()).rejects.toThrow(
      'Protocol error (Page.captureScreenshot): Internal error',
    );

    expect(screenshotMock).toHaveBeenCalledTimes(3);
    const warnCalls = getScreenshotWarnCalls();
    expect(warnCalls.length).toBe(3);
    // Exponential backoff: 500ms, 1000ms (no third sleep since we throw)
    expect(mockSleep).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenNthCalledWith(1, 500);
    expect(mockSleep).toHaveBeenNthCalledWith(2, 1000);
  });

  it('should NOT retry on unrecoverable errors (Target closed)', async () => {
    const targetClosedError = new Error(
      'Protocol error (Page.captureScreenshot): Target closed',
    );
    const screenshotMock = vi.fn().mockRejectedValue(targetClosedError);

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    await expect(page.screenshotBase64()).rejects.toThrow('Target closed');

    // Should only try once, no retries
    expect(screenshotMock).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('should NOT retry on unrecoverable errors (Session closed)', async () => {
    const sessionClosedError = new Error(
      'Protocol error (Page.bringToFront): Session closed. Most likely the page has been closed.',
    );
    const screenshotMock = vi.fn().mockRejectedValue(sessionClosedError);

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    await expect(page.screenshotBase64()).rejects.toThrow('Session closed');

    // Should only try once, no retries
    expect(screenshotMock).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('should NOT retry on unrecoverable errors (Execution context was destroyed)', async () => {
    const contextDestroyedError = new Error(
      'Execution context was destroyed, most likely because of a navigation.',
    );
    const screenshotMock = vi.fn().mockRejectedValue(contextDestroyedError);

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    await expect(page.screenshotBase64()).rejects.toThrow(
      'Execution context was destroyed',
    );

    // Should only try once, no retries
    expect(screenshotMock).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('should retry on generic recoverable errors', async () => {
    const genericError = new Error('Some transient network error');
    const screenshotMock = vi
      .fn()
      .mockRejectedValueOnce(genericError)
      .mockResolvedValueOnce('base64ImageData');

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    const result = await page.screenshotBase64();

    expect(screenshotMock).toHaveBeenCalledTimes(2);
    expect(result).toContain('base64ImageData');
  });

  it('should use exponential backoff delays', async () => {
    const cdpError = new Error(
      'Protocol error (Page.captureScreenshot): Internal error',
    );
    const screenshotMock = vi.fn().mockRejectedValue(cdpError);

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    await expect(page.screenshotBase64()).rejects.toThrow();

    // Verify exponential backoff: 500ms, 1000ms
    expect(mockSleep).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenNthCalledWith(1, 500); // 500 * 2^0
    expect(mockSleep).toHaveBeenNthCalledWith(2, 1000); // 500 * 2^1
    // Third attempt fails but no sleep after (we throw)
  });

  it('should log warning messages for each failed attempt', async () => {
    const error = new Error('Screenshot failed');
    const screenshotMock = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('base64ImageData');

    mockPuppeteerPage = createMockPuppeteerPage(screenshotMock);
    page = new Page(mockPuppeteerPage, 'puppeteer');

    await page.screenshotBase64();

    const warnCalls = getScreenshotWarnCalls();
    expect(warnCalls.length).toBe(2);
    expect(warnCalls[0][0]).toBe(
      '[midscene] Screenshot attempt 1/3 failed: Screenshot failed',
    );
    expect(warnCalls[1][0]).toBe(
      '[midscene] Screenshot attempt 2/3 failed: Screenshot failed',
    );
  });
});
