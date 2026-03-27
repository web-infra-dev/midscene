import { describe, expect, it } from 'vitest';

describe('PlaywrightAgent constructor validation', () => {
  it('should throw when page is undefined', async () => {
    const { PlaywrightAgent } = await import('@/playwright');
    expect(() => new PlaywrightAgent(undefined as any)).toThrow(
      '[midscene] PlaywrightAgent requires a valid Playwright page instance',
    );
  });

  it('should throw when page is null', async () => {
    const { PlaywrightAgent } = await import('@/playwright');
    expect(() => new PlaywrightAgent(null as any)).toThrow(
      '[midscene] PlaywrightAgent requires a valid Playwright page instance',
    );
  });

  it('should throw when touch interaction is used with non-chromium browser', async () => {
    const { InteractionMode, PlaywrightAgent } = await import('@/playwright');
    const page = {
      context: () => ({
        browser: () => ({
          browserType: () => ({
            name: () => 'firefox',
          }),
        }),
      }),
    };

    expect(
      () =>
        new PlaywrightAgent(page as any, {
          forceSameTabNavigation: false,
          interactionMode: InteractionMode.Touch,
        }),
    ).toThrow('touch interaction requires a Chromium-based Playwright');

    expect(
      () =>
        new PlaywrightAgent(page as any, {
          forceSameTabNavigation: false,
          enableTouchEventsInActionSpace: true,
        }),
    ).toThrow('touch interaction requires a Chromium-based Playwright');
  });
});

describe('PuppeteerAgent constructor validation', () => {
  it('should throw when page is undefined', async () => {
    const { PuppeteerAgent } = await import('@/puppeteer');
    expect(() => new PuppeteerAgent(undefined as any)).toThrow(
      '[midscene] PuppeteerAgent requires a valid Puppeteer page instance',
    );
  });

  it('should throw when page is null', async () => {
    const { PuppeteerAgent } = await import('@/puppeteer');
    expect(() => new PuppeteerAgent(null as any)).toThrow(
      '[midscene] PuppeteerAgent requires a valid Puppeteer page instance',
    );
  });
});
