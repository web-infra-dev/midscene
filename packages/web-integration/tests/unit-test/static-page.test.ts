import { ScreenshotItem } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { StaticPage } from '../../src/static';

const screenshotBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createContext(
  screenshot: ConstructorParameters<typeof StaticPage>[0]['screenshot'],
): ConstructorParameters<typeof StaticPage>[0] {
  return {
    shotSize: { width: 800, height: 600 },
    shrunkShotToLogicalRatio: 1,
    screenshot,
  };
}

describe('StaticPage', () => {
  it('returns WebP from a ScreenshotItem instance', async () => {
    const page = new StaticPage(
      createContext(ScreenshotItem.create(screenshotBase64, Date.now())),
    );

    await expect(page.screenshotBase64()).resolves.toMatch(
      /^data:image\/webp;base64,UklGR/,
    );
  });

  it('returns WebP from a restored report screenshot object', async () => {
    const page = new StaticPage(createContext({ base64: screenshotBase64 }));

    await expect(page.screenshotBase64()).resolves.toMatch(
      /^data:image\/webp;base64,UklGR/,
    );
  });

  it('returns WebP from a JSON-serialized ScreenshotItem', async () => {
    const serializedScreenshot = JSON.parse(
      JSON.stringify(ScreenshotItem.create(screenshotBase64, Date.now())),
    );
    const page = new StaticPage(createContext(serializedScreenshot));

    await expect(page.screenshotBase64()).resolves.toMatch(
      /^data:image\/webp;base64,UklGR/,
    );
  });

  it('returns the source bytes when Core will resize the screenshot', async () => {
    const page = new StaticPage(createContext({ base64: screenshotBase64 }));

    await expect(page.screenshotBase64({ preferLossless: true })).resolves.toBe(
      screenshotBase64,
    );
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
