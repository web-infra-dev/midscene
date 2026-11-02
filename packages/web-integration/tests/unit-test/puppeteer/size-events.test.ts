import { PuppeteerWebPage } from '@/puppeteer/page';
import { describe, expect, it, rs } from '@rstest/core';
import type { Page, Viewport } from 'puppeteer';

function fixture(viewport: Viewport | null = { width: 1440, height: 1000 }) {
  const browser = {};
  let notify!: (size: { width: number; height: number }) => Promise<void>;
  const metrics = {
    width: 800,
    height: 600,
    deviceScaleFactor: 1,
    hasTouch: false,
    scale: 1,
  };
  const page = {
    browser: () => browser,
    isClosed: () => false,
    viewport: () => viewport,
    exposeFunction: rs.fn(async (_name, callback) => {
      notify = callback;
    }),
    evaluateOnNewDocument: rs.fn(async () => ({ identifier: 'script' })),
    removeScriptToEvaluateOnNewDocument: rs.fn(async () => {}),
    removeExposedFunction: rs.fn(async () => {}),
    evaluate: rs.fn(async (fn: (...args: any[]) => unknown) =>
      fn.toString().includes('deviceScaleFactor')
        ? { ...metrics }
        : { width: metrics.width, height: metrics.height },
    ),
    setViewport: rs.fn(async (next) => {
      viewport = next;
    }),
    bringToFront: rs.fn(async () => {}),
    screenshot: rs.fn(async () => 'image'),
  };
  return { page, metrics, notify: () => notify(metrics) };
}

describe('optional Puppeteer size-change recovery', () => {
  it('uses the current browser metrics instead of stale event dimensions', async () => {
    const { page, metrics } = fixture();
    const adapter = new PuppeteerWebPage(page as unknown as Page);
    try {
      await adapter.size();
      await adapter.onSizeChange({ width: 1200, height: 900 });
      expect(page.viewport()).toMatchObject({ width: 800, height: 600 });
      expect(page.setViewport).toHaveBeenCalledOnce();
      Object.assign(metrics, { width: 900, height: 700 });
      await adapter.onSizeChange({ width: 1, height: 1 });
      await expect(adapter.size()).resolves.toEqual({
        width: 900,
        height: 700,
      });
    } finally {
      await adapter.destroy();
    }
  });

  it('continues regular capture when listener installation fails', async () => {
    const { page } = fixture();
    page.exposeFunction.mockRejectedValue(new Error('binding unavailable'));
    const adapter = new PuppeteerWebPage(page as unknown as Page);
    try {
      await expect(adapter.size()).resolves.toEqual({
        width: 800,
        height: 600,
      });
      await expect(adapter.screenshotBase64()).resolves.toContain('image');
      expect(page.setViewport).not.toHaveBeenCalled();
      // Only the original uncached size() read, no fallback viewport polling.
      expect(page.evaluate).toHaveBeenCalledTimes(1);
    } finally {
      await adapter.destroy();
    }
  });

  it('releases partially installed resources when injection fails', async () => {
    const { page } = fixture();
    page.evaluateOnNewDocument.mockRejectedValue(
      new Error('injection unavailable'),
    );
    const adapter = new PuppeteerWebPage(page as unknown as Page);
    try {
      await expect(adapter.screenshotBase64()).resolves.toContain('image');
      expect(page.removeExposedFunction).toHaveBeenCalledOnce();
    } finally {
      await adapter.destroy();
    }
  });

  it('swallows recovery failures without hiding ordinary screenshot errors', async () => {
    const { page } = fixture();
    const adapter = new PuppeteerWebPage(page as unknown as Page);
    try {
      await adapter.size();
      page.setViewport.mockRejectedValue(new Error('recovery unavailable'));
      await expect(
        adapter.onSizeChange({ width: 800, height: 600 }),
      ).resolves.toBeUndefined();
      await expect(adapter.screenshotBase64()).resolves.toContain('image');
      const failure = new Error('screenshot failed');
      page.screenshot.mockRejectedValue(failure);
      await expect(adapter.screenshotBase64()).rejects.toBe(failure);
    } finally {
      await adapter.destroy();
    }
  });

  it.each([{ isMobile: true }, { hasTouch: true }])(
    'does not install listeners for configured emulation %o',
    async (flags) => {
      const { page } = fixture({ width: 390, height: 844, ...flags });
      const adapter = new PuppeteerWebPage(page as unknown as Page);
      try {
        await adapter.screenshotBase64();
        expect(page.exposeFunction).not.toHaveBeenCalled();
        expect(page.evaluate).not.toHaveBeenCalled();
        expect(page.setViewport).not.toHaveBeenCalled();
      } finally {
        await adapter.destroy();
      }
    },
  );

  it('keeps native viewport mode when notified of new dimensions', async () => {
    const { page } = fixture(null);
    const adapter = new PuppeteerWebPage(page as unknown as Page);
    try {
      await adapter.onSizeChange({ width: 800, height: 600 });
      expect(page.viewport()).toBeNull();
      expect(page.setViewport).not.toHaveBeenCalled();
      await expect(adapter.size()).resolves.toEqual({
        width: 800,
        height: 600,
      });
    } finally {
      await adapter.destroy();
    }
  });

  it('ignores callbacks after destroy', async () => {
    const { page, notify } = fixture();
    const adapter = new PuppeteerWebPage(page as unknown as Page);
    await adapter.size();
    await adapter.destroy();
    page.evaluate.mockClear();
    await notify();
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.setViewport).not.toHaveBeenCalled();
  });
});
