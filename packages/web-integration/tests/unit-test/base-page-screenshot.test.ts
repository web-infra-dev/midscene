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
  it('waits for a visual paint before taking a playwright screenshot', async () => {
    const callOrder: string[] = [];
    const evaluate = vi.fn().mockImplementation(async (fn: () => unknown) => {
      callOrder.push('evaluate');
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      };
      return await fn();
    });
    const screenshot = vi.fn().mockImplementation(async () => {
      callOrder.push('screenshot');
      return Buffer.from('paint-ready-shot');
    });
    const mockPage = {
      url: () => 'http://example.com',
      isClosed: () => false,
      evaluate,
      screenshot,
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'chromium',
          }),
        }),
        newCDPSession: vi.fn(),
      }),
    } as any;

    const page = new Page(mockPage, 'playwright');
    await page.screenshotBase64();

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['evaluate', 'screenshot']);
  });

  it('uses the regular playwright screenshot path when it succeeds', async () => {
    const evaluate = vi.fn().mockImplementation(async (fn: () => unknown) => {
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      };
      return await fn();
    });
    const screenshot = vi.fn().mockResolvedValue(Buffer.from('plain-shot'));
    const newCDPSession = vi.fn();
    const mockPage = {
      url: () => 'http://example.com',
      isClosed: () => false,
      evaluate,
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
    const evaluate = vi.fn().mockImplementation(async (fn: () => unknown) => {
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      };
      return await fn();
    });
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
      evaluate,
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
});
