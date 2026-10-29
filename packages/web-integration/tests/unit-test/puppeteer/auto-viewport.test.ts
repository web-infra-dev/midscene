import { PuppeteerWebPage } from '@/puppeteer/page';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import type { Page, Viewport } from 'puppeteer';

rs.mock('@midscene/shared/img', () => ({
  createImgBase64ByFormat: (_type: string, data: string) => data,
  imageInfoOfBase64: rs.fn(),
}));

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
  const browser = {};
  const dispose = rs.fn().mockResolvedValue(undefined);
  const page = {
    browser: () => browser,
    isClosed: rs.fn(() => false),
    bringToFront: rs.fn().mockResolvedValue(undefined),
    viewport: rs.fn(() => configured),
    evaluate: rs.fn(async () => ({ ...actual })),
    evaluateHandle: rs.fn(async () => ({ dispose })),
    screenshot: rs.fn().mockResolvedValue('image'),
    setViewport: rs.fn(async (next: Viewport | null) => {
      configured = next;
    }),
  };
  return {
    adapter: new PuppeteerWebPage(page as unknown as Page),
    page,
    actual,
    dispose,
  };
}

describe('automatic Puppeteer viewport calibration', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('does not add size reads to direct mobile screenshots', async () => {
    const { adapter, page } = fixture({
      width: 390,
      height: 844,
      isMobile: true,
    });
    await adapter.screenshotBase64();
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.setViewport).not.toHaveBeenCalled();
  });

  it('preserves custom screenshot and logical-size overrides', async () => {
    const { page } = fixture();
    class CroppedPage extends PuppeteerWebPage {
      override async size() {
        return { width: 400, height: 300 };
      }
      override async screenshotBase64() {
        return 'cropped-image';
      }
    }
    const adapter = new CroppedPage(page as unknown as Page);
    await expect(adapter.screenshotWithSize()).resolves.toEqual({
      size: { width: 400, height: 300 },
      screenshotBase64: 'cropped-image',
    });
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.setViewport).not.toHaveBeenCalled();
  });

  it('takes one screenshot and two live reads without resetting a stable desktop viewport', async () => {
    const { adapter, page } = fixture();
    await expect(adapter.screenshotWithSize()).resolves.toEqual({
      size: { width: 1440, height: 1000 },
      screenshotBase64: 'image',
    });
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.screenshot).toHaveBeenCalledOnce();
    expect(page.setViewport).not.toHaveBeenCalled();
    expect(page.evaluateHandle).not.toHaveBeenCalled();
    expect(imageInfoOfBase64).not.toHaveBeenCalled();
  });

  it('adopts external dimensions and DPR before capturing, and refreshes the cached size', async () => {
    const { adapter, page, actual, dispose } = fixture({
      width: 1440,
      height: 1000,
      isLandscape: true,
    });
    await adapter.size();
    Object.assign(actual, { width: 800, height: 600, deviceScaleFactor: 1.3 });
    page.screenshot.mockImplementationOnce(async () => {
      expect(page.viewport()).toEqual({
        width: 800,
        height: 600,
        deviceScaleFactor: 1.3,
        isLandscape: true,
      });
      return 'image';
    });
    await expect(adapter.screenshotBase64()).resolves.toBe('image');
    await expect(adapter.size()).resolves.toEqual({ width: 800, height: 600 });
    expect(page.setViewport).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('resolves system-default DPR from browser metrics once without inspecting the screenshot', async () => {
    const { adapter, page, actual } = fixture({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 0,
    });
    actual.deviceScaleFactor = 2;
    await adapter.screenshotWithSize();
    expect(page.setViewport).toHaveBeenCalledOnce();
    expect(page.viewport()?.deviceScaleFactor).toBe(2);
    await adapter.screenshotWithSize();
    expect(page.setViewport).toHaveBeenCalledOnce();
    expect(page.screenshot).toHaveBeenCalledTimes(2);
    expect(imageInfoOfBase64).not.toHaveBeenCalled();
  });

  it('preserves native viewport mode and refreshes a stale logical size', async () => {
    const { adapter, page, actual } = fixture(null);
    await adapter.size();
    Object.assign(actual, { width: 800, height: 600 });
    await expect(adapter.screenshotWithSize()).resolves.toMatchObject({
      size: { width: 800, height: 600 },
    });
    expect(page.viewport()).toBeNull();
    expect(page.setViewport).not.toHaveBeenCalled();
  });

  it.each([{ isMobile: true }, { hasTouch: true }])(
    'keeps configured mobile/touch pages on the legacy path: %o',
    async (flags) => {
      const { adapter, page } = fixture({
        width: 1440,
        height: 1000,
        ...flags,
      });
      await adapter.size();
      page.evaluate.mockClear();
      await adapter.screenshotWithSize();
      expect(page.evaluate).not.toHaveBeenCalled();
      expect(page.setViewport).not.toHaveBeenCalled();
      expect(imageInfoOfBase64).not.toHaveBeenCalled();
    },
  );

  it.each([{ hasTouch: true }, { scale: 2 }])(
    'does not modify live touch or pinch zoom: %o',
    async (flags) => {
      const { adapter, page, actual } = fixture();
      Object.assign(actual, flags, { width: 800 });
      await adapter.screenshotWithSize();
      expect(page.setViewport).not.toHaveBeenCalled();
      expect(imageInfoOfBase64).not.toHaveBeenCalled();
    },
  );

  it.each([{ width: 0 }, { height: -1 }, { deviceScaleFactor: 0 }])(
    'rejects invalid live metrics without resizing: %o',
    async (metrics) => {
      const { adapter, page, actual } = fixture();
      Object.assign(actual, metrics);
      await expect(adapter.screenshotWithSize()).rejects.toThrow(
        'invalid live',
      );
      expect(page.setViewport).not.toHaveBeenCalled();
      expect(page.screenshot).not.toHaveBeenCalled();
    },
  );

  it.each(['document', 'viewport', 'DPR', 'page', 'closed'])(
    'discards the screenshot if %s changes during capture',
    async (change) => {
      const { adapter, page, actual } = fixture();
      page.screenshot.mockImplementationOnce(async () => {
        if (change === 'document') actual.timeOrigin++;
        if (change === 'viewport') actual.width++;
        if (change === 'DPR') actual.deviceScaleFactor = 2;
        if (change === 'page') adapter.underlyingPage = {} as Page;
        if (change === 'closed') page.isClosed.mockReturnValue(true);
        return 'image';
      });
      await expect(adapter.screenshotWithSize()).rejects.toThrow(
        /changed|closed/,
      );
    },
  );

  it('adopts fractional DPR from browser metrics', async () => {
    const { adapter, actual } = fixture();
    Object.assign(actual, { width: 801, height: 601, deviceScaleFactor: 1.3 });
    await expect(adapter.screenshotWithSize()).resolves.toMatchObject({
      size: { width: 801, height: 601 },
    });
  });

  it('preserves the original resize error and allows a later capture to recover', async () => {
    const { adapter, page, actual, dispose } = fixture();
    Object.assign(actual, { width: 800, height: 600 });
    const reason = new Error('setViewport failed');
    page.setViewport.mockRejectedValueOnce(reason);
    dispose.mockRejectedValueOnce(new Error('context destroyed'));
    await expect(adapter.screenshotWithSize()).rejects.toBe(reason);
    await expect(adapter.screenshotWithSize()).resolves.toMatchObject({
      size: { width: 800, height: 600 },
    });
  });

  it('serializes concurrent captures and does not apply the same repair twice', async () => {
    const { adapter, page, actual } = fixture();
    Object.assign(actual, { width: 800, height: 600 });
    await expect(
      Promise.all([adapter.screenshotWithSize(), adapter.screenshotWithSize()]),
    ).resolves.toHaveLength(2);
    expect(page.setViewport).toHaveBeenCalledOnce();
    expect(page.screenshot).toHaveBeenCalledTimes(2);
  });
});
