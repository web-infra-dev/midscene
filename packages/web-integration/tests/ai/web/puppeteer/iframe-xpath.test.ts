import fs from 'node:fs';
import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { createServer } from 'http-server';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { launchPage } from './utils';

const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

vi.setConfig({
  testTimeout: 3 * 60 * 1000,
});

describe('iframe element locate and cache (puppeteer agent)', () => {
  const port = 8787;
  let localServer: any;
  let resetFn: (() => Promise<void>) | undefined;
  let agent: PuppeteerAgent | undefined;

  beforeAll(async () => {
    localServer = await new Promise((resolve, reject) => {
      const server = createServer({ root: FIXTURES_DIR });
      server.listen(port, '127.0.0.1', () => resolve(server));
      server.server.on('error', reject);
    });
  });

  afterAll(() => {
    localServer?.server?.close();
  });

  afterEach(async () => {
    if (agent) {
      try {
        await agent.destroy();
      } catch {
        /* ignore */
      }
      agent = undefined;
    }
    if (resetFn) {
      try {
        await resetFn();
      } catch {
        /* ignore */
      }
      resetFn = undefined;
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  it('agent.aiLocate should locate an element inside same-origin iframe', async () => {
    const { originPage, reset } = await launchPage(
      `${baseUrl}/iframe-test.html`,
      {
        viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
      },
    );
    resetFn = reset;

    // Wait for iframe content to load
    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-btn');

    agent = new PuppeteerAgent(originPage, {
      cache: false,
    });

    const result = await agent.aiLocate('the "Submit Order" button');
    expect(result).toBeDefined();
    expect(result.center).toBeDefined();
    expect(result.center[0]).toBeGreaterThan(0);
    expect(result.center[1]).toBeGreaterThan(0);

    // The located element should be inside the iframe area
    const iframeRect = await originPage.evaluate(() => {
      const iframe = document.querySelector('#test-iframe')!;
      const rect = iframe.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    });

    // Center point should be within the iframe bounds
    expect(result.center[0]).toBeGreaterThanOrEqual(
      Math.floor(iframeRect.left),
    );
    expect(result.center[1]).toBeGreaterThanOrEqual(Math.floor(iframeRect.top));
    expect(result.center[0]).toBeLessThanOrEqual(
      Math.ceil(iframeRect.right) + 1,
    );
    expect(result.center[1]).toBeLessThanOrEqual(
      Math.ceil(iframeRect.bottom) + 1,
    );
  });

  it('agent.aiTap should tap element inside iframe', async () => {
    const { originPage, reset } = await launchPage(
      `${baseUrl}/iframe-test.html`,
      {
        viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
      },
    );
    resetFn = reset;

    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-btn');

    agent = new PuppeteerAgent(originPage, {
      cache: false,
    });

    // Should not throw - tap should work on iframe inner element
    await agent.aiTap('the "Submit Order" button');
  });

  it('cache should store compound xpath and re-locate iframe element on second run', async () => {
    const cacheId = `iframe-cache-test-${Date.now()}`;

    // --- First run: AI locate, cache write ---
    {
      const { originPage, reset } = await launchPage(
        `${baseUrl}/iframe-test.html`,
        {
          viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
        },
      );

      await originPage.waitForSelector('#test-iframe');
      const iframeHandle = await originPage.$('#test-iframe');
      const frame = await iframeHandle!.contentFrame();
      await frame!.waitForSelector('#inner-btn');

      const agent1 = new PuppeteerAgent(originPage, {
        cache: { id: cacheId, strategy: 'write-only' },
      });

      // First locate - goes through AI, writes cache
      const result1 = await agent1.aiLocate('the "Submit Order" button');
      expect(result1).toBeDefined();
      expect(result1.center[0]).toBeGreaterThan(0);

      await sleep(1000);

      // Verify cache file was written
      const cacheFilePath = agent1.taskCache?.cacheFilePath;
      expect(cacheFilePath).toBeDefined();
      expect(fs.existsSync(cacheFilePath!)).toBe(true);

      // Read cache content and verify it contains compound xpath with |>>|
      const cacheContent = fs.readFileSync(cacheFilePath!, 'utf-8');
      expect(cacheContent).toContain('|>>|');
      expect(cacheContent).toContain('iframe');

      await agent1.destroy();
      await reset();
    }

    // --- Second run: cache read, xpath re-locate ---
    {
      const { originPage, reset } = await launchPage(
        `${baseUrl}/iframe-test.html`,
        {
          viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
        },
      );
      resetFn = reset;

      await originPage.waitForSelector('#test-iframe');
      const iframeHandle = await originPage.$('#test-iframe');
      const frame = await iframeHandle!.contentFrame();
      await frame!.waitForSelector('#inner-btn');

      agent = new PuppeteerAgent(originPage, {
        cache: { id: cacheId, strategy: 'read-only' },
      });

      // Second locate - should hit cache and use xpath to re-locate
      const result2 = await agent.aiLocate('the "Submit Order" button');
      expect(result2).toBeDefined();
      expect(result2.center[0]).toBeGreaterThan(0);
      expect(result2.center[1]).toBeGreaterThan(0);
    }
  });

  it('cacheFeatureForPoint should return compound xpath for point inside iframe', async () => {
    const { originPage, reset } = await launchPage(
      `${baseUrl}/iframe-test.html`,
      {
        viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
      },
    );
    resetFn = reset;

    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-btn');

    agent = new PuppeteerAgent(originPage);

    // Get iframe rect to compute a point inside the iframe
    const iframeRect = await originPage.evaluate(() => {
      const iframe = document.querySelector('#test-iframe')!;
      const rect = iframe.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });

    // Point inside iframe hitting the button
    const point: [number, number] = [
      Math.round(iframeRect.left + 50),
      Math.round(iframeRect.top + 80),
    ];

    const feature = (await agent.page.cacheFeatureForPoint?.(point)) as
      | { xpaths: string[] }
      | undefined;

    expect(feature).toBeDefined();
    expect(feature!.xpaths).toBeDefined();
    expect(feature!.xpaths.length).toBeGreaterThan(0);
    // Should contain compound xpath with |>>| for iframe element
    expect(feature!.xpaths[0]).toContain('|>>|');
    expect(feature!.xpaths[0]).toMatch(/iframe/);
  });

  it('rectMatchesCacheFeature should resolve compound xpath and return valid rect', async () => {
    const { originPage, reset } = await launchPage(
      `${baseUrl}/iframe-test.html`,
      {
        viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
      },
    );
    resetFn = reset;

    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-btn');

    agent = new PuppeteerAgent(originPage);

    // Get iframe rect
    const iframeRect = await originPage.evaluate(() => {
      const iframe = document.querySelector('#test-iframe')!;
      const rect = iframe.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });

    // First get compound xpath via cacheFeatureForPoint
    const point: [number, number] = [
      Math.round(iframeRect.left + 50),
      Math.round(iframeRect.top + 80),
    ];
    const feature = (await agent.page.cacheFeatureForPoint?.(point)) as
      | { xpaths: string[] }
      | undefined;
    expect(feature!.xpaths[0]).toContain('|>>|');

    // Now use rectMatchesCacheFeature to validate the cached xpath
    const rect = await agent.page.rectMatchesCacheFeature?.(feature!);

    expect(rect).toBeDefined();
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBeGreaterThan(0);
    // Rect should be within the iframe area
    expect(rect!.left).toBeGreaterThanOrEqual(Math.floor(iframeRect.left));
    expect(rect!.top).toBeGreaterThanOrEqual(Math.floor(iframeRect.top));
  });

  it('rectMatchesCacheFeature should throw for invalid compound xpath', async () => {
    const { originPage, reset } = await launchPage(
      `${baseUrl}/iframe-test.html`,
      {
        viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
      },
    );
    resetFn = reset;
    agent = new PuppeteerAgent(originPage);

    // Invalid iframe index
    await expect(
      agent.page.rectMatchesCacheFeature?.({
        xpaths: ['/html/body/iframe[99]|>>|/html/body/button[1]'],
      }),
    ).rejects.toThrow();
  });
});
