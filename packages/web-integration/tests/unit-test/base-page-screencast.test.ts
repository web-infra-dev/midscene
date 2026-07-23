import { Buffer } from 'node:buffer';
import { Page } from '@/puppeteer/base-page';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/img', async () => {
  const actual = await vi.importActual<typeof import('@midscene/shared/img')>(
    '@midscene/shared/img',
  );
  return {
    ...actual,
    imageInfoOfBase64: vi.fn(),
  };
});

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

beforeEach(() => {
  vi.mocked(imageInfoOfBase64).mockResolvedValue({
    width: 1280,
    height: 768,
  });
});

function jpegBase64(width: number, height: number): string {
  // A minimal JPEG header containing one SOF0 segment. The production code
  // only needs this header to read dimensions before it forwards a CDP frame.
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]).toString('base64');
}

const webpBase64 =
  'UklGRioAAABXRUJQVlA4IB4AAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+hNQAAAA=';

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
      maxWidth: 1280,
      maxHeight: 768,
      everyNthFrame: 1,
    });

    await handlers.get('Page.screencastFrame')?.({
      data: 'ZnJhbWU=',
      sessionId: 42,
      metadata: { deviceWidth: 1280, deviceHeight: 768 },
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

  it('falls back to a screenshot when a screencast JPEG does not match the viewport', async () => {
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
      evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 720 }),
      screenshot: vi.fn().mockResolvedValue(webpBase64),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: vi.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = vi.fn();
    const onError = vi.fn();
    const page = new Page(mockPage, 'puppeteer');
    const handle = await page.startMjpegStream({ onFrame, onError });
    (page as any).activeMjpegStream.hasReceivedScreencastFrame = true;
    onFrame.mockClear();
    onError.mockClear();
    vi.mocked(imageInfoOfBase64).mockResolvedValue({
      width: 1280,
      height: 720,
    });

    await handlers.get('Page.screencastFrame')?.({
      data: jpegBase64(2400, 1896),
      sessionId: 42,
      metadata: { deviceWidth: 1280, deviceHeight: 720 },
    });
    await vi.waitFor(() => {
      expect(onFrame).toHaveBeenCalledWith({
        data: webpBase64,
        contentType: 'image/webp',
      });
    });

    expect(onError).not.toHaveBeenCalled();
    // A rejected CDP frame must still ACK; otherwise the stream cannot later
    // recover when Chromium emits a correctly sized frame.
    expect(send).toHaveBeenCalledWith('Page.screencastFrameAck', {
      sessionId: 42,
    });

    await handle.stop();
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
      type: 'webp',
      quality: 90,
      encoding: 'base64',
    });
    // Hub contract: MjpegStreamFrame.data is bare base64, never a data URL.
    expect(onFrame).toHaveBeenCalledWith({
      data: 'cmVmcmVzaA==',
      contentType: 'image/webp',
    });

    await handle.stop();
    mockPage.screenshot.mockClear();
    await page.flushPendingVisualUpdate();
    expect(mockPage.screenshot).not.toHaveBeenCalled();
  });

  it('does not mix fallback screenshots into an active CDP screencast', async () => {
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
      evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 768 }),
      screenshot: vi.fn().mockResolvedValue('ZmFsbGJhY2s='),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: vi.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = vi.fn();
    const page = new Page(mockPage, 'puppeteer');

    const handle = await page.startMjpegStream({ onFrame });
    await handlers.get('Page.screencastFrame')?.({
      data: 'bmF0aXZlLWZyYW1l',
      sessionId: 42,
    });
    await Promise.resolve();
    mockPage.screenshot.mockClear();

    await page.flushPendingVisualUpdate();

    expect(mockPage.screenshot).not.toHaveBeenCalled();
    expect(onFrame).toHaveBeenLastCalledWith({
      data: 'bmF0aXZlLWZyYW1l',
      contentType: 'image/jpeg',
    });

    await handle.stop();
  });

  it('force-pushes a final screenshot after navigation replaces the preview with a transient frame', async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 720 }),
      screenshot: vi.fn().mockResolvedValue(webpBase64),
      url: () => 'http://example.com',
    } as any;
    const page = new Page(mockPage, 'puppeteer');
    const onFrame = vi.fn();
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame,
      hasReceivedScreencastFrame: true,
      expectedViewportSize: { width: 1280, height: 720 },
    };
    vi.mocked(imageInfoOfBase64).mockResolvedValueOnce({
      width: 1280,
      height: 720,
    });

    await page.flushPendingVisualUpdate(true);

    expect(mockPage.screenshot).toHaveBeenCalledWith({
      type: 'webp',
      quality: 90,
      encoding: 'base64',
    });
    expect(onFrame).toHaveBeenCalledWith({
      data: webpBase64,
      contentType: 'image/webp',
    });
  });

  it('does not fail the MJPEG stream when visual refresh races with navigation', async () => {
    const mockPage = {
      evaluate: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Execution context was destroyed, most likely because of a navigation.',
          ),
        ),
      screenshot: vi.fn(),
      url: () => 'http://example.com',
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    const onError = vi.fn();
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame: vi.fn(),
      onError,
    };

    await page.flushPendingVisualUpdate();

    expect(mockPage.screenshot).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects a fallback screenshot whose dimensions do not match the viewport', async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 720 }),
      url: () => 'http://example.com',
    } as any;
    const page = new Page(mockPage, 'puppeteer');
    const onFrame = vi.fn();
    const onError = vi.fn();
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame,
      onError,
      hasReceivedScreencastFrame: false,
      expectedViewportSize: { width: 1280, height: 720 },
    };
    vi.spyOn(page, 'screenshotBase64').mockResolvedValue(
      'data:image/jpeg;base64,ZmFsbGJhY2s=',
    );
    vi.mocked(imageInfoOfBase64).mockResolvedValueOnce({
      width: 1280,
      height: 1024,
    });

    await page.flushPendingVisualUpdate();

    expect(onFrame).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Screenshot fallback aspect ratio mismatch: expected viewport 1280x720, received 1280x1024',
      }),
    );
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

  it('runs a delayed follow-up visual refresh after the immediate one', async () => {
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

    const flushSpy = vi
      .spyOn(page, 'flushPendingVisualUpdate')
      .mockImplementation(async () => undefined);

    page.schedulePendingVisualUpdate();

    expect(flushSpy).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(799);
    await Promise.resolve();
    expect(flushSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
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
