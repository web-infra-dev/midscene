import fs from 'node:fs';
import {
  type Server as NodeServer,
  createServer as createNodeServer,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { createServer as createStaticServer } from 'http-server';
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

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type BrowserPoint = [number, number];

type CacheFeatureWithXpaths = {
  xpaths?: string[];
};

const crossOriginChildHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; font-family: sans-serif; }
      #target-button {
        position: absolute;
        left: 64px;
        top: 48px;
        width: 148px;
        height: 44px;
      }
    </style>
  </head>
  <body>
    <button id="target-button">Cross Origin Submit</button>
  </body>
</html>`;

function crossOriginParentHtml(childUrl: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; font-family: sans-serif; }
      #cross-origin-frame {
        position: absolute;
        left: 120px;
        top: 90px;
        width: 420px;
        height: 220px;
        border: 0;
      }
    </style>
  </head>
  <body>
    <h1>Parent page</h1>
    <iframe id="cross-origin-frame" src="${childUrl}"></iframe>
  </body>
</html>`;
}

function listenNodeServer(server: NodeServer): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeNodeServer(server: NodeServer | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function readRect(element: Element): RectLike {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function pointInsideRects(
  iframeRect: RectLike,
  buttonRect: RectLike,
): BrowserPoint {
  return [
    Math.round(iframeRect.left + buttonRect.left + buttonRect.width / 2),
    Math.round(iframeRect.top + buttonRect.top + buttonRect.height / 2),
  ];
}

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
      const server = createStaticServer({ root: FIXTURES_DIR });
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

  it('cacheFeatureForPoint should round-trip an element inside a cross-origin iframe', async () => {
    let childServer: NodeServer | undefined;
    let parentServer: NodeServer | undefined;

    try {
      childServer = createNodeServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(crossOriginChildHtml);
      });
      const childOrigin = await listenNodeServer(childServer);

      parentServer = createNodeServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(crossOriginParentHtml(`${childOrigin}/child.html`));
      });
      const parentOrigin = await listenNodeServer(parentServer);

      const { originPage, reset } = await launchPage(
        `${parentOrigin}/parent.html`,
        {
          viewport: { width: 900, height: 600, deviceScaleFactor: 1 },
        },
      );
      resetFn = reset;

      await originPage.waitForSelector('#cross-origin-frame');
      const iframeHandle = await originPage.$('#cross-origin-frame');
      const frame = await iframeHandle!.contentFrame();
      expect(frame).toBeTruthy();
      await frame!.waitForSelector('#target-button');

      agent = new PuppeteerAgent(originPage);

      const iframeRect = await iframeHandle!.evaluate(readRect);
      const buttonRect = await frame!.$eval('#target-button', readRect);
      const point = pointInsideRects(iframeRect, buttonRect);

      const feature = (await agent.page.cacheFeatureForPoint?.(point)) as
        | { xpaths: string[] }
        | undefined;

      expect(feature).toBeDefined();
      expect(feature!.xpaths).toBeDefined();
      expect(feature!.xpaths.length).toBeGreaterThan(0);
      expect(feature!.xpaths[0]).toContain('|>>|');
      expect(feature!.xpaths[0]).toMatch(/iframe/);
      expect(feature!.xpaths[0]).toMatch(/button/);

      const rect = await agent.page.rectMatchesCacheFeature?.(feature!);
      expect(rect).toBeDefined();
      expect(rect!.width).toBeGreaterThan(0);
      expect(rect!.height).toBeGreaterThan(0);
      expect(
        Math.abs(rect!.left + rect!.width / 2 - point[0]),
      ).toBeLessThanOrEqual(3);
      expect(
        Math.abs(rect!.top + rect!.height / 2 - point[1]),
      ).toBeLessThanOrEqual(3);
    } finally {
      await Promise.all([
        closeNodeServer(parentServer),
        closeNodeServer(childServer),
      ]);
    }
  });

  it('cache should write and reuse a cross-origin iframe locator cache on second run', async () => {
    let childServer: NodeServer | undefined;
    let parentServer: NodeServer | undefined;
    const cacheId = `cross-origin-iframe-cache-test-${Date.now()}`;
    const prompt = 'the "Cross Origin Submit" button';

    try {
      childServer = createNodeServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(crossOriginChildHtml);
      });
      const childOrigin = await listenNodeServer(childServer);

      parentServer = createNodeServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(crossOriginParentHtml(`${childOrigin}/child.html`));
      });
      const parentOrigin = await listenNodeServer(parentServer);
      const parentUrl = `${parentOrigin}/parent.html`;

      let cacheFilePath: string | undefined;

      // First run writes the cross-origin locator cache to disk.
      {
        const { originPage, reset } = await launchPage(parentUrl, {
          viewport: { width: 900, height: 600, deviceScaleFactor: 1 },
        });
        resetFn = reset;

        await originPage.waitForSelector('#cross-origin-frame');
        const iframeHandle = await originPage.$('#cross-origin-frame');
        const frame = await iframeHandle!.contentFrame();
        expect(frame).toBeTruthy();
        await frame!.waitForSelector('#target-button');

        agent = new PuppeteerAgent(originPage, {
          cache: { id: cacheId, strategy: 'write-only' },
        });

        const result = await agent.aiLocate(prompt);
        expect(result.center).toBeDefined();
        expect(result.center![0]).toBeGreaterThan(0);
        expect(result.center![1]).toBeGreaterThan(0);

        await sleep(1000);

        cacheFilePath = agent.taskCache?.cacheFilePath;
        expect(cacheFilePath).toBeDefined();
        expect(fs.existsSync(cacheFilePath!)).toBe(true);

        const cacheContent = fs.readFileSync(cacheFilePath!, 'utf-8');
        expect(cacheContent).toContain(prompt);
        expect(cacheContent).toContain('|>>|');
        expect(cacheContent).toMatch(/iframe/);
        expect(cacheContent).toMatch(/button/);

        await agent.destroy();
        agent = undefined;
        await reset();
        resetFn = undefined;
      }

      // Second run reads the same cache file and re-locates via cached xpath.
      {
        const { originPage, reset } = await launchPage(parentUrl, {
          viewport: { width: 900, height: 600, deviceScaleFactor: 1 },
        });
        resetFn = reset;

        await originPage.waitForSelector('#cross-origin-frame');
        const iframeHandle = await originPage.$('#cross-origin-frame');
        const frame = await iframeHandle!.contentFrame();
        expect(frame).toBeTruthy();
        await frame!.waitForSelector('#target-button');

        const iframeRect = await iframeHandle!.evaluate(readRect);
        const buttonRect = await frame!.$eval('#target-button', readRect);
        const expectedPoint = pointInsideRects(iframeRect, buttonRect);

        agent = new PuppeteerAgent(originPage, {
          cache: { id: cacheId, strategy: 'read-only' },
        });

        const originalRectMatchesCacheFeature =
          agent.page.rectMatchesCacheFeature?.bind(agent.page);
        expect(originalRectMatchesCacheFeature).toBeDefined();

        let matchedFeature: CacheFeatureWithXpaths | undefined;
        let matchedCenter: BrowserPoint | undefined;
        agent.page.rectMatchesCacheFeature = async (feature) => {
          matchedFeature = feature as CacheFeatureWithXpaths;
          const rect = await originalRectMatchesCacheFeature!(feature);
          matchedCenter = [
            Math.round(rect.left + rect.width / 2),
            Math.round(rect.top + rect.height / 2),
          ];
          return rect;
        };

        const result = await agent.aiLocate(prompt);
        expect(result.center).toBeDefined();
        expect(matchedFeature).toBeDefined();
        expect(matchedFeature!.xpaths).toBeDefined();
        expect(matchedFeature!.xpaths![0]).toContain('|>>|');
        expect(matchedFeature!.xpaths![0]).toMatch(/iframe/);
        expect(matchedFeature!.xpaths![0]).toMatch(/button/);
        expect(matchedCenter).toBeDefined();
        expect(
          Math.abs(matchedCenter![0] - expectedPoint[0]),
        ).toBeLessThanOrEqual(3);
        expect(
          Math.abs(matchedCenter![1] - expectedPoint[1]),
        ).toBeLessThanOrEqual(3);
        expect(
          Math.abs(result.center![0] - matchedCenter![0]),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.center![1] - matchedCenter![1]),
        ).toBeLessThanOrEqual(1);
      }
    } finally {
      await Promise.all([
        closeNodeServer(parentServer),
        closeNodeServer(childServer),
      ]);
    }
  });
});
