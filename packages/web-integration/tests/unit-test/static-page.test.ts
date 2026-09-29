import { ScreenshotItem } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { StaticPage, StaticPageAgent } from '../../src/static';

const screenshotBase64 = 'data:image/png;base64,abc123';

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
  it('returns base64 from a ScreenshotItem instance', async () => {
    const page = new StaticPage(
      createContext(ScreenshotItem.create(screenshotBase64, Date.now())),
    );

    await expect(page.screenshotBase64()).resolves.toBe(screenshotBase64);
  });

  it('returns base64 from a restored report screenshot object', async () => {
    const page = new StaticPage(createContext({ base64: screenshotBase64 }));

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

  it('lets StaticPageAgent reuse the prepared UI context', async () => {
    const capturedAt = 123;
    const page = new StaticPage(
      createContext({ base64: screenshotBase64, capturedAt }),
    );
    const agent = new StaticPageAgent(page);

    const context = await agent.getUIContext();

    expect(context.shotSize).toEqual({ width: 800, height: 600 });
    expect(context.shrunkShotToLogicalRatio).toBe(1);
    expect(context.screenshot).toBeInstanceOf(ScreenshotItem);
    expect(context.screenshot.base64).toBe(screenshotBase64);
    expect(context.screenshot.capturedAt).toBe(capturedAt);

    const updatedScreenshotBase64 = 'data:image/png;base64,updated';
    page.updateContext(
      createContext({ base64: updatedScreenshotBase64, capturedAt: 456 }),
    );

    const updatedContext = await agent.getUIContext();

    expect(updatedContext).not.toBe(context);
    expect(updatedContext.screenshot.base64).toBe(updatedScreenshotBase64);
    expect(updatedContext.screenshot.capturedAt).toBe(456);
  });
});
