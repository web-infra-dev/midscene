import { createHash } from 'node:crypto';
import { Page, debugPage } from '@/puppeteer/base-page';
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

describe('Page operation diagnostics', () => {
  const events = () =>
    rs.mocked(debugPage).mock.calls.flatMap(([message]) => {
      if (typeof message !== 'string' || !message.startsWith('{')) return [];
      const event = JSON.parse(message);
      return event.event === 'page-operation' ? [event] : [];
    });

  it('correlates overlapping captures without logging screenshot content or URLs', async () => {
    rs.mocked(debugPage).mockClear();
    let finishFirst!: (value: Buffer) => void;
    const first = new Page(
      {
        screenshot: () =>
          new Promise<Buffer>((resolve) => {
            finishFirst = resolve;
          }),
      } as any,
      'playwright',
    );
    const second = new Page(
      {
        screenshot: async () => Buffer.from('second'),
        url: () => 'https://example.com?token=secret',
      } as any,
      'playwright',
    );
    const pending = first.screenshotBase64();
    const secondResult = await second.screenshotBase64();
    finishFirst(Buffer.from('first'));
    await pending;
    const records = events();
    expect(records.map((event) => event.phase)).toEqual([
      'begin',
      'begin',
      'end',
      'end',
    ]);
    expect(records[0].pageId).not.toEqual(records[1].pageId);
    expect(records[0].pageId).toEqual(records[3].pageId);
    expect(records[1].pageId).toEqual(records[2].pageId);
    expect(records[2].screenshotHash).toEqual(
      createHash('sha256').update(secondResult).digest('hex').slice(0, 16),
    );
    expect(JSON.stringify(records)).not.toContain(secondResult);
    expect(JSON.stringify(records)).not.toContain('secret');
  });

  it('distinguishes click dispatch from return and associates subsequent captures with the same page', async () => {
    rs.mocked(debugPage).mockClear();
    let finishClick!: () => void;
    let markDispatched!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      markDispatched = resolve;
    });
    const page = new Page(
      {
        mouse: {
          move: async () => {},
          click: () =>
            new Promise<void>((resolve) => {
              finishClick = resolve;
              markDispatched();
            }),
        },
        screenshot: async () => Buffer.from('after-click'),
      } as any,
      'playwright',
    );
    const pending = page.mouse.click(20, 30);
    await dispatched;
    expect(events().map((event) => event.phase)).toEqual(['begin', 'dispatch']);
    finishClick();
    await pending;
    await page.screenshotBase64();
    const records = events();
    expect(records.map((event) => event.phase)).toEqual([
      'begin',
      'dispatch',
      'returned',
      'begin',
      'end',
    ]);
    expect(new Set(records.map((event) => event.pageId)).size).toBe(1);
    expect(records[3].operationId).toBe(records[0].operationId + 1);
  });

  it('closes failed operations and preserves the original errors', async () => {
    rs.mocked(debugPage).mockClear();
    const error = new Error('private page content');
    const page = new Page(
      {
        mouse: {
          move: async () => {},
          click: async () => {
            throw error;
          },
        },
        screenshot: async () => {
          throw error;
        },
        isClosed: () => true,
      } as any,
      'playwright',
    );
    await expect(page.mouse.click(20, 30)).rejects.toBe(error);
    await expect(page.screenshotBase64()).rejects.toBe(error);
    expect(events().filter((event) => event.phase === 'error')).toHaveLength(2);
    expect(
      events().filter(
        (event) => event.phase === 'returned' || event.phase === 'end',
      ),
    ).toHaveLength(0);
    expect(JSON.stringify(events())).not.toContain(error.message);
  });
});
