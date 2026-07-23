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
  const webpBody =
    'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';
  const pngBody =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('uses Puppeteer native WebP capture', async () => {
    const screenshot = vi.fn().mockResolvedValue(webpBody);
    const page = new Page(
      {
        url: () => 'http://example.com',
        screenshot,
      } as any,
      'puppeteer',
    );

    await expect(page.screenshotBase64()).resolves.toBe(
      `data:image/webp;base64,${webpBody}`,
    );
    expect(screenshot).toHaveBeenCalledWith({
      type: 'webp',
      quality: 90,
      encoding: 'base64',
    });
  });

  it('uses Chromium CDP native WebP when available', async () => {
    const screenshot = vi.fn().mockResolvedValue(Buffer.from('plain-shot'));
    const detach = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({ data: webpBody });
    const newCDPSession = vi.fn().mockResolvedValue({ send, detach });
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

    expect(result).toBe(`data:image/webp;base64,${webpBody}`);
    expect(screenshot).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'webp',
      quality: 90,
    });
  });

  it('falls back to public PNG capture and returns WebP without CDP', async () => {
    const screenshot = vi
      .fn()
      .mockResolvedValue(Buffer.from(pngBody, 'base64'));
    const newCDPSession = vi
      .fn()
      .mockRejectedValue(new Error('CDP unavailable'));
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

    expect(result).toMatch(/^data:image\/webp;base64,UklGR/);
    expect(newCDPSession).toHaveBeenCalledTimes(1);
    expect(screenshot).toHaveBeenCalledWith({
      type: 'png',
      timeout: 10 * 1000,
    });
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
      message: expect.stringContaining(
        'Playwright screenshot failed through both CDP WebP and PNG fallback',
      ),
    });
    expect(newCDPSession).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'webp',
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
      message: expect.stringContaining(
        'Playwright screenshot failed through both CDP WebP and PNG fallback',
      ),
    });
    expect(detach).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
