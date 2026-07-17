import { Buffer } from 'node:buffer';
import { Page } from '@/puppeteer/base-page';
import * as coreUtilsActual from '@midscene/core/utils' with {
  rstest: 'importActual',
};
import { imageInfoOfBase64 } from '@midscene/shared/img';
import * as sharedImgActual from '@midscene/shared/img' with {
  rstest: 'importActual',
};
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/img', () => ({
  ...sharedImgActual,
  imageInfoOfBase64: rs.fn(),
}));

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

afterEach(() => {
  rs.useRealTimers();
});

beforeEach(() => {
  rs.mocked(imageInfoOfBase64).mockResolvedValue({
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

describe('Page startMjpegStream', () => {
  it('starts a Puppeteer CDP screencast and ACKs incoming frames', async () => {
    const handlers = new Map<string, (event: any) => unknown>();
    const send = rs.fn().mockResolvedValue(undefined);
    const detach = rs.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: rs.fn((event: string, handler: (event: any) => unknown) => {
        handlers.set(event, handler);
      }),
      off: rs.fn(),
    };
    const mockPage = {
      bringToFront: rs.fn().mockResolvedValue(undefined),
      evaluate: rs.fn().mockResolvedValue({ width: 1280, height: 768 }),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: rs.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = rs.fn();

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
    const send = rs.fn().mockResolvedValue(undefined);
    const detach = rs.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: rs.fn((event: string, handler: (event: any) => unknown) => {
        handlers.set(event, handler);
      }),
      off: rs.fn(),
    };
    const mockPage = {
      bringToFront: rs.fn().mockResolvedValue(undefined),
      evaluate: rs.fn().mockResolvedValue({ width: 1280, height: 720 }),
      screenshot: rs.fn().mockResolvedValue(jpegBase64(1280, 720)),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: rs.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = rs.fn();
    const onError = rs.fn();
    const page = new Page(mockPage, 'puppeteer');
    const handle = await page.startMjpegStream({ onFrame, onError });
    (page as any).activeMjpegStream.hasReceivedScreencastFrame = true;
    onFrame.mockClear();
    onError.mockClear();
    rs.mocked(imageInfoOfBase64).mockResolvedValue({
      width: 1280,
      height: 720,
    });

    await handlers.get('Page.screencastFrame')?.({
      data: jpegBase64(2400, 1896),
      sessionId: 42,
      metadata: { deviceWidth: 1280, deviceHeight: 720 },
    });
    await rs.waitFor(() => {
      expect(onFrame).toHaveBeenCalledWith({
        data: jpegBase64(1280, 720),
        contentType: 'image/jpeg',
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
    const send = rs.fn().mockResolvedValue(undefined);
    const detach = rs.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: rs.fn(),
      off: rs.fn(),
    };
    const mockPage = {
      evaluate: rs.fn().mockResolvedValue({ width: 1280, height: 768 }),
      url: () => 'http://example.com',
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'chromium',
          }),
        }),
        newCDPSession: rs.fn().mockResolvedValue(client),
      }),
    } as any;
    const controller = new AbortController();

    const page = new Page(mockPage, 'playwright');
    await page.startMjpegStream({
      signal: controller.signal,
      onFrame: rs.fn(),
    });
    controller.abort();

    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledWith('Page.stopScreencast');
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('can push a screenshot frame to refresh keyboard-only visual changes', async () => {
    const send = rs.fn().mockResolvedValue(undefined);
    const detach = rs.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: rs.fn(),
      off: rs.fn(),
    };
    const mockPage = {
      bringToFront: rs.fn().mockResolvedValue(undefined),
      evaluate: rs.fn().mockResolvedValue({ width: 1280, height: 768 }),
      screenshot: rs.fn().mockResolvedValue('cmVmcmVzaA=='),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: rs.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = rs.fn();

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

  it('does not mix fallback screenshots into an active CDP screencast', async () => {
    const handlers = new Map<string, (event: any) => unknown>();
    const send = rs.fn().mockResolvedValue(undefined);
    const detach = rs.fn().mockResolvedValue(undefined);
    const client = {
      send,
      detach,
      on: rs.fn((event: string, handler: (event: any) => unknown) => {
        handlers.set(event, handler);
      }),
      off: rs.fn(),
    };
    const mockPage = {
      evaluate: rs.fn().mockResolvedValue({ width: 1280, height: 768 }),
      screenshot: rs.fn().mockResolvedValue('ZmFsbGJhY2s='),
      url: () => 'http://example.com',
      target: () => ({
        createCDPSession: rs.fn().mockResolvedValue(client),
      }),
    } as any;
    const onFrame = rs.fn();
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

  it('does not fail the MJPEG stream when visual refresh races with navigation', async () => {
    const mockPage = {
      evaluate: rs
        .fn()
        .mockRejectedValue(
          new Error(
            'Execution context was destroyed, most likely because of a navigation.',
          ),
        ),
      screenshot: rs.fn(),
      url: () => 'http://example.com',
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    const onError = rs.fn();
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame: rs.fn(),
      onError,
    };

    await page.flushPendingVisualUpdate();

    expect(mockPage.screenshot).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects a fallback screenshot whose dimensions do not match the viewport', async () => {
    const mockPage = {
      evaluate: rs.fn().mockResolvedValue({ width: 1280, height: 720 }),
      url: () => 'http://example.com',
    } as any;
    const page = new Page(mockPage, 'puppeteer');
    const onFrame = rs.fn();
    const onError = rs.fn();
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame,
      onError,
      hasReceivedScreencastFrame: false,
      expectedViewportSize: { width: 1280, height: 720 },
    };
    rs.spyOn(page, 'screenshotBase64').mockResolvedValue(
      'data:image/jpeg;base64,ZmFsbGJhY2s=',
    );
    rs.mocked(imageInfoOfBase64).mockResolvedValueOnce({
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
    rs.useFakeTimers();
    const mockPage = {
      evaluate: rs.fn(async () => ({ width: 1280, height: 768 })),
      url: () => 'http://example.com',
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame: rs.fn(),
    };

    let resolveFirstFlush = () => {};
    const flushSpy = rs
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
    rs.useFakeTimers();
    const mockPage = {
      evaluate: rs.fn(async () => ({ width: 1280, height: 768 })),
      url: () => 'http://example.com',
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    (page as any).activeMjpegStream = {
      token: Symbol('mjpeg-stream'),
      onFrame: rs.fn(),
    };

    const flushSpy = rs
      .spyOn(page, 'flushPendingVisualUpdate')
      .mockImplementation(async () => undefined);

    page.schedulePendingVisualUpdate();

    expect(flushSpy).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();

    rs.advanceTimersByTime(799);
    await Promise.resolve();
    expect(flushSpy).toHaveBeenCalledTimes(1);

    rs.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(flushSpy).toHaveBeenCalledTimes(2);
  });
});

describe('Page web navigation controls', () => {
  it('uses page history for forward navigation', async () => {
    const mockPage = {
      goForward: rs.fn().mockResolvedValue(undefined),
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    await page.goForward();

    expect(mockPage.goForward).toHaveBeenCalledTimes(1);
  });

  it('stops Puppeteer page loading through CDP', async () => {
    const send = rs.fn().mockResolvedValue(undefined);
    const detach = rs.fn().mockResolvedValue(undefined);
    const client = { send, detach };
    const mockPage = {
      target: () => ({
        createCDPSession: rs.fn().mockResolvedValue(client),
      }),
    } as any;

    const page = new Page(mockPage, 'puppeteer');
    await page.stopLoading();

    expect(send).toHaveBeenCalledWith('Page.stopLoading');
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('reports Puppeteer loading state from document.readyState', async () => {
    const mockPage = {
      evaluate: rs.fn().mockResolvedValue('interactive'),
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
