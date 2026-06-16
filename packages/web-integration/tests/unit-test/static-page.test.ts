import { ScreenshotItem } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { StaticPage } from '../../src/static';

const screenshotBase64 = 'data:image/png;base64,abc123';

function createContext(
  screenshot: unknown,
): ConstructorParameters<typeof StaticPage>[0] {
  return {
    shotSize: { width: 800, height: 600 },
    shrunkShotToLogicalRatio: 1,
    screenshot,
  } as ConstructorParameters<typeof StaticPage>[0];
}

describe('StaticPage', () => {
  it('returns base64 from a ScreenshotItem instance', async () => {
    const page = new StaticPage(
      createContext(ScreenshotItem.create(screenshotBase64, Date.now())),
    );

    await expect(page.screenshotBase64()).resolves.toBe(screenshotBase64);
  });

  it('returns base64 from a JSON-serialized ScreenshotItem', async () => {
    const serializedScreenshot = JSON.parse(
      JSON.stringify(ScreenshotItem.create(screenshotBase64, Date.now())),
    );
    const page = new StaticPage(createContext(serializedScreenshot));

    await expect(page.screenshotBase64()).resolves.toBe(screenshotBase64);
  });

  it('rejects screenshot refs that do not include base64 data', async () => {
    const page = new StaticPage(
      createContext({
        type: 'midscene_screenshot_ref',
        id: 'screenshot-id',
        capturedAt: Date.now(),
        mimeType: 'image/png',
        storage: 'inline',
      }),
    );

    await expect(page.screenshotBase64()).rejects.toThrow(
      'serialized reference without base64 data',
    );
  });
});
