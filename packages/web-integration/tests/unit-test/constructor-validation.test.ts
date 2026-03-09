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
