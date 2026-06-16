import { Page } from '@/puppeteer/base-page';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.useRealTimers();
});

describe('Page startMjpegStream', () => {
  it('starts a Puppeteer CDP screencast and ACKs incoming frames', async () => {
    const handlers = new Map<string, (event: any) => unknown>();
    const send = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: vi.fn((event: string, handler: (event: any) => unknown) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
    };
    const mockPage = {
      bringToFront: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 768 }),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: vi.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = vi.fn();

    const page = new Page(mockPage, 'puppeteer');
    const handle = await page.startMjpegStream({ onFrame });

    expect(mockPage.bringToFront).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Page.enable');
    expect(send).toHaveBeenCalledWith('Emulation.setVisibleSize', {
      width: 1280,
      height: 768,
    });
    expect(send).toHaveBeenCalledWith('Page.startScreencast', {
      format: 'jpeg',
      quality: 70,
      everyNthFrame: 1,
    });

    await handlers.get('Page.screencastFrame')?.({
      data: 'ZnJhbWU=',
      sessionId: 42,
    });

    expect(onFrame).toHaveBeenCalledWith({
      data: 'ZnJhbWU=',
      contentType: 'image/jpeg',
    });
    expect(send).toHaveBeenCalledWith('Page.screencastFrameAck', {
      sessionId: 42,
    });

    await handle.stop();
    expect(send).toHaveBeenCalledWith('Page.stopScreencast');
    expect(detach).toHaveBeenCalledTimes(1);
    expect(client.off).toHaveBeenCalledWith(
      'Page.screencastFrame',
      expect.any(Function),
    );
  });

  it('stops the screencast when the abort signal fires', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: vi.fn(),
      off: vi.fn(),
    };
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 768 }),
      url: () => 'http://example.com',
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'chromium',
          }),
        }),
        newCDPSession: vi.fn().mockResolvedValue(client),
      }),
    } as any;
    const controller = new AbortController();

    const page = new Page(mockPage, 'playwright');
    await page.startMjpegStream({
      signal: controller.signal,
      onFrame: vi.fn(),
    });
    controller.abort();

    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledWith('Page.stopScreencast');
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('can push a screenshot frame to refresh keyboard-only visual changes', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: vi.fn(),
      off: vi.fn(),
    };
    const mockPage = {
      bringToFront: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 768 }),
      screenshot: vi.fn().mockResolvedValue('cmVmcmVzaA=='),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: vi.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = vi.fn();

    const page = new Page(mockPage, 'puppeteer');
    const handle = await page.startMjpegStream({ onFrame });

    await page.flushPendingVisualUpdate();

    expect(mockPage.screenshot).toHaveBeenCalledWith({
      type: 'jpeg',
      quality: 90,
      encoding: 'base64',
    });
    // Hub contract: MjpegStreamFrame.data is bare base64, never a data URL.
    expect(onFrame).toHaveBeenCalledWith({
      data: 'cmVmcmVzaA==',
      contentType: 'image/jpeg',
    });

    await handle.stop();
    mockPage.screenshot.mockClear();
    await page.flushPendingVisualUpdate();
    expect(mockPage.screenshot).not.toHaveBeenCalled();
  });

  it('coalesces scheduled visual refreshes while one refresh is in flight', async () => {
    vi.useFakeTimers();
    const mockPage = {
      evaluate: vi.fn(async () => ({ width: 1280, height: 768 })),
      url: () => 'http://example.com',
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame: vi.fn(),
    };

    let resolveFirstFlush = () => {};
    const flushSpy = vi
      .spyOn(page, 'flushPendingVisualUpdate')
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstFlush = resolve;
          }),
      )
      .mockImplementation(async () => undefined);

    page.schedulePendingVisualUpdate();
    page.schedulePendingVisualUpdate();
    page.schedulePendingVisualUpdate();

    expect(flushSpy).toHaveBeenCalledTimes(1);

    resolveFirstFlush?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(flushSpy).toHaveBeenCalledTimes(2);
  });
});

describe('Page web navigation controls', () => {
  it('uses page history for forward navigation', async () => {
    const mockPage = {
      goForward: vi.fn().mockResolvedValue(undefined),
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    await page.goForward();

    expect(mockPage.goForward).toHaveBeenCalledTimes(1);
  });

  it('stops Puppeteer page loading through CDP', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const client = { send, detach };
    const mockPage = {
      target: () => ({
        createCDPSession: vi.fn().mockResolvedValue(client),
      }),
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    await page.stopLoading();

    expect(send).toHaveBeenCalledWith('Page.stopLoading');
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('reports Puppeteer loading state from document.readyState', async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue('interactive'),
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    await expect(page.navigationState()).resolves.toEqual({
      isLoading: true,
    });

    mockPage.evaluate.mockResolvedValue('complete');
    await expect(page.navigationState()).resolves.toEqual({
      isLoading: false,
    });
  });
});
