import { PuppeteerWebPage } from '@/puppeteer/page';
import { describe, expect, it, rs } from '@rstest/core';
import type { Page, Viewport } from 'puppeteer';

function fixture(
  viewport: Viewport | null = {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
  },
) {
  let configured = viewport;
  const actual = {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    scale: 1,
    hasTouch: false,
    timeOrigin: 1,
    sameDocument: true,
  };
  const dispose = rs.fn().mockResolvedValue(undefined);
  const page = {
    isClosed: rs.fn(() => false),
    viewport: rs.fn(() => configured),
    evaluate: rs.fn(async () => ({ ...actual })),
    evaluateHandle: rs.fn(async () => ({ dispose })),
    setViewport: rs.fn(async (next: Viewport | null) => {
      configured = next;
    }),
  };
  const adapter = new PuppeteerWebPage(page as unknown as Page);
  async function primeSize(width = 1440, height = 1000) {
    page.evaluate.mockResolvedValueOnce({ width, height } as typeof actual);
    await adapter.size();
    page.evaluate.mockClear();
  }
  return { adapter, page, actual, dispose, primeSize };
}

describe('PuppeteerWebPage.syncViewport', () => {
  it('reads live metrics once without resizing when the viewport is consistent', async () => {
    const { adapter, page } = fixture();
    await expect(adapter.syncViewport()).resolves.toEqual({
      changed: false,
      viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    });
    await expect(adapter.size()).resolves.toEqual({
      width: 1440,
      height: 1000,
    });
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.setViewport).not.toHaveBeenCalled();
    expect(page.evaluateHandle).not.toHaveBeenCalled();
  });

  it('resolves the system-default DPR sentinel to the live DPR', async () => {
    const { adapter, page, actual } = fixture({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 0,
    });
    actual.deviceScaleFactor = 2;
    await expect(adapter.syncViewport()).resolves.toMatchObject({
      changed: true,
      viewport: { deviceScaleFactor: 2 },
    });
    expect(page.setViewport).toHaveBeenCalledExactlyOnceWith({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 2,
    });
  });

  it('refreshes an expired SDK size without resetting a matching Puppeteer viewport', async () => {
    const { adapter, page, actual, primeSize } = fixture({
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
    });
    await primeSize();
    Object.assign(actual, { width: 800, height: 600 });
    await expect(adapter.syncViewport()).resolves.toMatchObject({
      changed: true,
    });
    await expect(adapter.size()).resolves.toEqual({ width: 800, height: 600 });
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.setViewport).not.toHaveBeenCalled();
  });

  it('adopts external metrics while preserving Puppeteer emulation flags', async () => {
    const { adapter, page, actual, dispose, primeSize } = fixture({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      isLandscape: true,
      isMobile: false,
      hasTouch: false,
    });
    await primeSize(800, 600);
    Object.assign(actual, { width: 800, height: 600, deviceScaleFactor: 2 });
    await expect(adapter.syncViewport()).resolves.toEqual({
      changed: true,
      viewport: { width: 800, height: 600, deviceScaleFactor: 2 },
    });
    expect(page.setViewport).toHaveBeenCalledExactlyOnceWith({
      width: 800,
      height: 600,
      deviceScaleFactor: 2,
      isLandscape: true,
      isMobile: false,
      hasTouch: false,
    });
    expect(dispose).toHaveBeenCalledOnce();
    await expect(adapter.size()).resolves.toEqual({ width: 800, height: 600 });
  });

  it('preserves native viewport mode while refreshing the SDK size', async () => {
    const { adapter, page, actual, primeSize } = fixture(null);
    await primeSize();
    Object.assign(actual, { width: 800, height: 600 });
    await expect(adapter.syncViewport()).resolves.toMatchObject({
      changed: true,
    });
    expect(page.viewport()).toBeNull();
    expect(page.setViewport).not.toHaveBeenCalled();
    await expect(adapter.size()).resolves.toEqual({ width: 800, height: 600 });
  });

  it.each([
    { width: 0 },
    { height: -1 },
    { width: 800.5 },
    { deviceScaleFactor: 0 },
    { deviceScaleFactor: Number.NaN },
    { scale: 2 },
    { hasTouch: true },
  ])(
    'rejects unsupported live metrics before changing emulation: %o',
    async (metrics) => {
      const { adapter, page, actual } = fixture();
      Object.assign(actual, metrics);
      await expect(adapter.syncViewport()).rejects.toThrow();
      expect(page.setViewport).not.toHaveBeenCalled();
      expect(page.evaluateHandle).not.toHaveBeenCalled();
    },
  );

  it.each([{ isMobile: true }, { hasTouch: true }])(
    'rejects mobile emulation before changing it: %o',
    async (flags) => {
      const { adapter, page } = fixture({
        width: 1440,
        height: 1000,
        ...flags,
      });
      await expect(adapter.syncViewport()).rejects.toThrow('desktop');
      expect(page.setViewport).not.toHaveBeenCalled();
    },
  );

  it('preserves cancellation and performs no probe when already aborted', async () => {
    const { adapter, page } = fixture();
    const controller = new AbortController();
    const reason = new Error('cancel synchronization');
    controller.abort(reason);
    await expect(
      adapter.syncViewport({ signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('clears an old size if cancellation arrives after emulation changes', async () => {
    const { adapter, page, actual, dispose, primeSize } = fixture();
    await primeSize();
    Object.assign(actual, { width: 800, height: 600 });
    const controller = new AbortController();
    const reason = new Error('cancel after resize');
    page.setViewport.mockImplementationOnce(async () => {
      controller.abort(reason);
    });
    await expect(
      adapter.syncViewport({ signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(dispose).toHaveBeenCalledOnce();
    page.evaluate.mockResolvedValueOnce({
      width: 800,
      height: 600,
    } as typeof actual);
    await expect(adapter.size()).resolves.toEqual({ width: 800, height: 600 });
  });

  it.each(['document', 'metrics', 'active page'])(
    'fails if the %s changes while synchronizing',
    async (change) => {
      const { adapter, page, actual, dispose, primeSize } = fixture();
      await primeSize();
      Object.assign(actual, { width: 800, height: 600 });
      page.setViewport.mockImplementationOnce(async () => {
        if (change === 'document') actual.sameDocument = false;
        if (change === 'metrics') actual.width = 900;
        if (change === 'active page') adapter.underlyingPage = {} as Page;
      });
      await expect(adapter.syncViewport()).rejects.toThrow();
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it('keeps the original viewport failure even when remote-handle disposal also fails', async () => {
    const { adapter, page, actual, dispose } = fixture();
    Object.assign(actual, { width: 800, height: 600 });
    const reason = new Error('setViewport failed');
    page.setViewport.mockRejectedValueOnce(reason);
    dispose.mockRejectedValueOnce(new Error('execution context was destroyed'));
    await expect(adapter.syncViewport()).rejects.toBe(reason);
  });

  it('refuses overlapping synchronization without preventing the first call from completing', async () => {
    const { adapter, page, actual } = fixture();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    page.evaluate.mockImplementationOnce(async () => {
      await held;
      return { ...actual };
    });
    const first = adapter.syncViewport();
    try {
      await expect(adapter.syncViewport()).rejects.toThrow('in progress');
    } finally {
      release();
    }
    await expect(first).resolves.toMatchObject({ changed: false });
  });
});
