import { capturePuppeteerScreenshot } from '@/puppeteer/screenshot';
import { describe, expect, it, rs } from '@rstest/core';
import type { Browser, Page } from 'puppeteer';

const options = { type: 'jpeg', encoding: 'base64' } as const;

describe('Puppeteer screenshot activation', () => {
  it('keeps each tab active until capture completes without blocking other browsers', async () => {
    const browser = {} as Browser;
    const otherBrowser = {} as Browser;
    const activePages = new Map<Browser, string>();
    let releaseFirst!: () => void;
    const firstCapture = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let notifyFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      notifyFirstStarted = resolve;
    });
    const createPage = (owner: Browser, id: string) => ({
      browser: () => owner,
      bringToFront: rs.fn(async () => {
        activePages.set(owner, id);
      }),
      screenshot: rs.fn(async () => {
        expect(activePages.get(owner)).toBe(id);
        if (id === 'first') {
          notifyFirstStarted();
          await firstCapture;
        }
        expect(activePages.get(owner)).toBe(id);
        return id;
      }),
    });
    const first = createPage(browser, 'first');
    const second = createPage(browser, 'second');
    const other = createPage(otherBrowser, 'other');

    const firstResult = capturePuppeteerScreenshot(
      first as unknown as Page,
      options,
    );
    await firstStarted;
    const secondResult = capturePuppeteerScreenshot(
      second as unknown as Page,
      options,
    );
    try {
      await expect(
        capturePuppeteerScreenshot(other as unknown as Page, options),
      ).resolves.toBe('other');
      expect(second.bringToFront).not.toHaveBeenCalled();
    } finally {
      releaseFirst();
    }
    await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([
      'first',
      'second',
    ]);
  });

  it.each(['bringToFront', 'screenshot'] as const)(
    'releases queued captures after a %s failure and preserves the error',
    async (method) => {
      const browser = {} as Browser;
      const error = new Error('Capture failed');
      const failing = {
        browser: () => browser,
        bringToFront: rs.fn().mockResolvedValue(undefined),
        screenshot: rs.fn().mockResolvedValue('first'),
      };
      failing[method].mockRejectedValue(error);
      const next = {
        browser: () => browser,
        bringToFront: rs.fn().mockResolvedValue(undefined),
        screenshot: rs.fn().mockResolvedValue('next'),
      };
      const results = await Promise.allSettled([
        capturePuppeteerScreenshot(failing as unknown as Page, options),
        capturePuppeteerScreenshot(next as unknown as Page, options),
      ]);
      expect(results).toEqual([
        { status: 'rejected', reason: error },
        { status: 'fulfilled', value: 'next' },
      ]);
    },
  );
});
