import { Page } from '@/puppeteer/base-page';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
  logMsg: vi.fn(),
}));

vi.mock('@midscene/core/utils', async () => {
  const actual = await vi.importActual('@midscene/core/utils');
  return {
    ...actual,
    sleep: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@midscene/shared/node', () => ({
  getElementInfosScriptContent: vi.fn(() => ''),
  getExtraReturnLogic: vi.fn(() => Promise.resolve('() => ({})')),
}));

vi.mock('@/web-page', () => ({
  commonWebActionsForWebPage: vi.fn(() => []),
}));

describe('Page screenshotBase64', () => {
  it('bounds a high-DPR Puppeteer screenshot at the capture source', async () => {
    const screenshot = vi.fn().mockResolvedValue('Ym91bmRlZC1zaG90');
    const evaluate = vi.fn().mockResolvedValue({
      x: 0,
      y: 0,
      width: 3840,
      height: 2160,
      deviceScaleFactor: 2,
    });
    const page = new Page({ evaluate, screenshot } as any, 'puppeteer');

    const result = await page.screenshotBase64({
      maxLongEdge: 3840,
      optimizeForSpeed: true,
    });

    expect(result).toContain('data:image/jpeg;base64,');
    expect(screenshot).toHaveBeenCalledWith({
      type: 'jpeg',
      quality: 90,
      encoding: 'base64',
      optimizeForSpeed: true,
      clip: {
        x: 0,
        y: 0,
        width: 3840,
        height: 2160,
        scale: 0.5,
      },
      captureBeyondViewport: true,
    });
  });

  it('uses the regular playwright screenshot path when it succeeds', async () => {
    const screenshot = vi.fn().mockResolvedValue(Buffer.from('plain-shot'));
    const newCDPSession = vi.fn();
    const mockPage = {
      url: () => 'http://example.com',
      isClosed: () => false,
      screenshot,
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'chromium',
          }),
        }),
        newCDPSession,
      }),
    } as any;

    const page = new Page(mockPage, 'playwright');
    const result = await page.screenshotBase64();

    expect(result).toContain('data:image/jpeg;base64,');
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(newCDPSession).not.toHaveBeenCalled();
  });

  it('falls back to a CDP screenshot when playwright screenshot times out', async () => {
    const screenshot = vi
      .fn()
      .mockRejectedValue(
        new Error('page.screenshot: Timeout 10000ms exceeded.'),
      );
    const detach = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({ data: 'Y2RwLXNob3Q=' });
    const newCDPSession = vi.fn().mockResolvedValue({
      send,
      detach,
    });
    const mockPage = {
      url: () => 'http://example.com',
      isClosed: () => false,
      screenshot,
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'chromium',
          }),
        }),
        newCDPSession,
      }),
    } as any;

    const page = new Page(mockPage, 'playwright');
    const result = await page.screenshotBase64();

    expect(result).toContain('data:image/jpeg;base64,');
    expect(newCDPSession).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
    });
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('uses a bounded CDP screenshot directly for Playwright', async () => {
    const screenshot = vi.fn();
    const evaluate = vi.fn().mockResolvedValue({
      x: 10,
      y: 20,
      width: 3840,
      height: 2160,
      deviceScaleFactor: 2,
    });
    const detach = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({ data: 'Y2RwLXNob3Q=' });
    const newCDPSession = vi.fn().mockResolvedValue({ send, detach });
    const mockPage = {
      evaluate,
      url: () => 'http://example.com',
      isClosed: () => false,
      screenshot,
      context: () => ({
        browser: () => ({
          browserType: () => ({ name: () => 'chromium' }),
        }),
        newCDPSession,
      }),
    } as any;
    const page = new Page(mockPage, 'playwright');

    await page.screenshotBase64({
      maxLongEdge: 3840,
      optimizeForSpeed: true,
    });

    expect(screenshot).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
      clip: {
        x: 10,
        y: 20,
        width: 3840,
        height: 2160,
        scale: 0.5,
      },
      optimizeForSpeed: true,
    });
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('times out when the CDP screenshot fallback does not return in time', async () => {
    vi.useFakeTimers();

    const screenshot = vi
      .fn()
      .mockRejectedValue(
        new Error('page.screenshot: Timeout 10000ms exceeded.'),
      );
    const detach = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn(() => new Promise(() => {}));
    const newCDPSession = vi.fn().mockResolvedValue({
      send,
      detach,
    });
    const mockPage = {
      url: () => 'http://example.com',
      isClosed: () => false,
      screenshot,
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'chromium',
          }),
        }),
        newCDPSession,
      }),
    } as any;

    const page = new Page(mockPage, 'playwright');
    const resultPromise = page.screenshotBase64().then(
      () => undefined,
      (error) => error,
    );

    await vi.advanceTimersByTimeAsync(10 * 1000);

    await expect(resultPromise).resolves.toMatchObject({
      message: 'CDP screenshot timeout after 10000ms.',
    });
    expect(newCDPSession).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
    });
    expect(detach).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does not wait for CDP session detach after the screenshot timeout', async () => {
    vi.useFakeTimers();

    const screenshot = vi
      .fn()
      .mockRejectedValue(
        new Error('page.screenshot: Timeout 10000ms exceeded.'),
      );
    const detach = vi.fn(() => new Promise(() => {}));
    const send = vi.fn(() => new Promise(() => {}));
    const newCDPSession = vi.fn().mockResolvedValue({
      send,
      detach,
    });
    const mockPage = {
      url: () => 'http://example.com',
      isClosed: () => false,
      screenshot,
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'chromium',
          }),
        }),
        newCDPSession,
      }),
    } as any;

    const page = new Page(mockPage, 'playwright');
    const resultPromise = page.screenshotBase64().then(
      () => undefined,
      (error) => error,
    );

    await vi.advanceTimersByTimeAsync(10 * 1000);

    await expect(resultPromise).resolves.toMatchObject({
      message: 'CDP screenshot timeout after 10000ms.',
    });
    expect(detach).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('times out a stuck Puppeteer screenshot instead of blocking the queue forever', async () => {
    vi.useFakeTimers();

    const screenshot = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce('cmVjb3ZlcmVk');
    const page = new Page(
      {
        screenshot,
        evaluate: vi.fn(),
        url: () => 'http://example.com',
      } as any,
      'puppeteer',
    );

    const stuck = page.screenshotBase64().then(
      () => undefined,
      (error) => error,
    );

    await vi.advanceTimersByTimeAsync(10 * 1000);

    await expect(stuck).resolves.toMatchObject({
      message: 'Puppeteer screenshot timeout after 10000ms.',
    });

    // The serialized queue must remain usable after a timed-out capture.
    const recovered = page.screenshotBase64();
    await vi.advanceTimersByTimeAsync(0);
    await expect(recovered).resolves.toContain(
      'data:image/jpeg;base64,cmVjb3ZlcmVk',
    );
    expect(screenshot).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('serializes captures and keeps the queue usable after a failure', async () => {
    let rejectFirst!: (reason?: unknown) => void;
    const first = new Promise<string>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const screenshot = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce('c2Vjb25k')
      .mockResolvedValueOnce('dGhpcmQ=');
    const page = new Page(
      {
        screenshot,
        evaluate: vi.fn(),
        url: () => 'http://example.com',
      } as any,
      'puppeteer',
    );

    const firstCapture = page.screenshotBase64();
    const secondCapture = page.screenshotBase64();
    await Promise.resolve();
    await Promise.resolve();

    expect(screenshot).toHaveBeenCalledTimes(1);
    rejectFirst(new Error('first capture failed'));
    await expect(firstCapture).rejects.toThrow('first capture failed');
    await expect(secondCapture).resolves.toContain(
      'data:image/jpeg;base64,c2Vjb25k',
    );
    expect(screenshot).toHaveBeenCalledTimes(2);

    await expect(page.screenshotBase64()).resolves.toContain(
      'data:image/jpeg;base64,dGhpcmQ=',
    );
    expect(screenshot).toHaveBeenCalledTimes(3);
  });
});
