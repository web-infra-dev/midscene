import { defaultViewportHeight, defaultViewportWidth } from '@/common/viewport';
import {
  WebPuppeteerMidsceneTools,
  buildDetachedChromeArgs,
} from '@/mcp-tools-puppeteer';
import { describe, expect, it } from 'vitest';

describe('WebPuppeteerMidsceneTools', () => {
  it('builds detached Chrome args from the configured viewport', () => {
    const args = buildDetachedChromeArgs({
      userDataDir: '/tmp/midscene-profile',
      viewport: { width: 1720, height: 980 },
    });

    expect(args).toContain('--window-size=1720,980');
    expect(args).toContain('--headless=new');
  });

  it('uses the configured viewport for the temporary device placeholder', async () => {
    const tools = new WebPuppeteerMidsceneTools({ width: 1680, height: 1050 });

    const device = (tools as any).createTemporaryDevice();
    await expect(device.size()).resolves.toEqual({
      width: 1680,
      height: 1050,
    });
  });

  it('keeps the shared default viewport for the default constructor', async () => {
    const tools = new WebPuppeteerMidsceneTools();

    const device = (tools as any).createTemporaryDevice();
    await expect(device.size()).resolves.toEqual({
      width: defaultViewportWidth,
      height: defaultViewportHeight,
    });
  });
});
