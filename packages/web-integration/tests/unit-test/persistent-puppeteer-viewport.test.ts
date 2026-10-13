import { setPersistentPuppeteerViewport } from '@/common/persistent-puppeteer-viewport';
import { describe, expect, it, rstest } from '@rstest/core';
import type { Page } from 'puppeteer-core';

function fixture(frame: { width: number; height: number }) {
  const session = {
    send: rstest.fn().mockResolvedValue({ windowId: 7 }),
    detach: rstest.fn().mockResolvedValue(undefined),
  };
  const page = {
    setViewport: rstest.fn().mockResolvedValue(undefined),
    evaluate: rstest.fn().mockResolvedValue(frame),
    createCDPSession: rstest.fn().mockResolvedValue(session),
    waitForFunction: rstest.fn().mockResolvedValue(undefined),
  };
  return { page, session };
}

describe('persistent Puppeteer viewport', () => {
  it.each([
    { width: 0, height: 87 },
    { width: 0, height: 0 },
  ])(
    'sizes the native content area with frame %j before emulation',
    async (frame) => {
      const { page, session } = fixture(frame);
      const viewport = { width: 1536, height: 864 };
      await setPersistentPuppeteerViewport(page as unknown as Page, viewport);

      expect(page.setViewport.mock.calls).toEqual([[null], [viewport]]);
      expect(session.send.mock.calls).toEqual([
        ['Browser.getWindowForTarget'],
        [
          'Browser.setWindowBounds',
          {
            windowId: 7,
            bounds: {
              width: viewport.width + frame.width,
              height: viewport.height + frame.height,
            },
          },
        ],
      ]);
      expect(page.waitForFunction).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 5_000 },
        viewport,
      );
      expect(session.detach).toHaveBeenCalledTimes(1);
    },
  );

  it('detaches and propagates resize failures without claiming the viewport', async () => {
    const { page, session } = fixture({ width: 0, height: 87 });
    const error = new Error('content size did not match');
    page.waitForFunction.mockRejectedValue(error);
    await expect(
      setPersistentPuppeteerViewport(page as unknown as Page, {
        width: 1536,
        height: 864,
      }),
    ).rejects.toThrow(error);
    expect(session.detach).toHaveBeenCalledTimes(1);
    expect(page.setViewport.mock.calls).toEqual([[null]]);
  });
});
