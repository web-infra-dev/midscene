import {
  GroupedActionDump,
  ScreenshotItem,
  restoreImageReferences,
} from '@midscene/core';
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

  it('keeps an Insight task report context available to the Playground', async () => {
    const screenshot = ScreenshotItem.create(screenshotBase64, 123);
    const dump = new GroupedActionDump({
      sdkVersion: '1.13.0',
      groupName: 'aiAssert report',
      modelBriefs: [],
      executions: [
        {
          logTime: 123,
          name: 'aiAssert',
          tasks: [
            {
              taskId: 'assert-task',
              type: 'Insight',
              subType: 'Assert',
              status: 'finished',
              uiContext: createContext(screenshot),
              executor: async () => undefined,
            } as any,
          ],
        },
      ],
    });

    const restored = restoreImageReferences(
      JSON.parse(dump.serialize()),
      () => screenshotBase64,
    ) as any;
    const context = restored.executions[0].tasks[0].uiContext;
    const agent = new StaticPageAgent(new StaticPage(context));

    await expect(agent.getUIContext()).resolves.toMatchObject({
      shotSize: { width: 800, height: 600 },
      screenshot: { base64: screenshotBase64, capturedAt: 123 },
    });
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
