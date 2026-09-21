import { Page } from '@/puppeteer/base-page';
import * as coreUtilsActual from '@midscene/core/utils' with {
  rstest: 'importActual',
};
import { describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
  logMsg: rs.fn(),
}));

rs.mock('@midscene/core/utils', () => ({
  ...coreUtilsActual,
  sleep: rs.fn(() => Promise.resolve()),
}));

rs.mock('@midscene/shared/node', () => ({
  getElementInfosScriptContent: rs.fn(() => ''),
  getExtraReturnLogic: rs.fn(() => Promise.resolve('() => ({})')),
}));

rs.mock('@/web-page', () => ({
  commonWebActionsForWebPage: rs.fn(() => []),
}));

describe('Page screenshotBase64', () => {
  it('uses the regular playwright screenshot path when it succeeds', async () => {
    const screenshot = rs.fn().mockResolvedValue(Buffer.from('plain-shot'));
    const newCDPSession = rs.fn();
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
    const screenshot = rs
      .fn()
      .mockRejectedValue(
        new Error('page.screenshot: Timeout 10000ms exceeded.'),
      );
    const detach = rs.fn().mockResolvedValue(undefined);
    const send = rs.fn().mockResolvedValue({ data: 'Y2RwLXNob3Q=' });
    const newCDPSession = rs.fn().mockResolvedValue({
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

  it('times out when the CDP screenshot fallback does not return in time', async () => {
    rs.useFakeTimers();

    const screenshot = rs
      .fn()
      .mockRejectedValue(
        new Error('page.screenshot: Timeout 10000ms exceeded.'),
      );
    const detach = rs.fn().mockResolvedValue(undefined);
    const send = rs.fn(() => new Promise(() => {}));
    const newCDPSession = rs.fn().mockResolvedValue({
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

    await rs.advanceTimersByTimeAsync(10 * 1000);

    await expect(resultPromise).resolves.toMatchObject({
      message: 'CDP screenshot timeout after 10000ms.',
    });
    expect(newCDPSession).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
    });
    expect(detach).toHaveBeenCalledTimes(1);

    rs.useRealTimers();
  });

  it('does not wait for CDP session detach after the screenshot timeout', async () => {
    rs.useFakeTimers();

    const screenshot = rs
      .fn()
      .mockRejectedValue(
        new Error('page.screenshot: Timeout 10000ms exceeded.'),
      );
    const detach = rs.fn(() => new Promise(() => {}));
    const send = rs.fn(() => new Promise(() => {}));
    const newCDPSession = rs.fn().mockResolvedValue({
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

    await rs.advanceTimersByTimeAsync(10 * 1000);

    await expect(resultPromise).resolves.toMatchObject({
      message: 'CDP screenshot timeout after 10000ms.',
    });
    expect(detach).toHaveBeenCalledTimes(1);

    rs.useRealTimers();
  });
});
