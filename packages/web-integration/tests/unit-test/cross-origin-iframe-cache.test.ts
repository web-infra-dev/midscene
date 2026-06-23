import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebPage as PlaywrightWebPage } from '@/playwright/page';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { type Browser as PlaywrightBrowser, chromium } from 'playwright';
import puppeteer, {
  type Browser as PuppeteerBrowser,
  type Page as PuppeteerPage,
} from 'puppeteer';
import type {
  ElementHandle as PuppeteerElementHandle,
  Frame as PuppeteerFrame,
} from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/core/ai-model', () => ({
  AiJudgeOrderSensitive: vi.fn(),
  callAIWithObjectResponse: vi.fn(),
}));

vi.mock('@/web-page', () => ({
  commonWebActionsForWebPage: vi.fn(() => []),
}));

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type BrowserPoint = [number, number];

type FrameElementHandle =
  | PuppeteerElementHandle<HTMLIFrameElement>
  | import('playwright').ElementHandle<HTMLIFrameElement>;

type BrowserFrame = PuppeteerFrame | import('playwright').Frame;

const childHtml = `<!doctype html>
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

function parentHtml(childUrl: string) {
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

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server | undefined): Promise<void> {
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

function readRect(el: Element): RectLike {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

async function pointInsideCrossOriginButton(
  iframeHandle: FrameElementHandle,
  frame: BrowserFrame,
): Promise<BrowserPoint> {
  const iframeRect = await iframeHandle.evaluate(readRect);
  const buttonRect = await frame.$eval('#target-button', readRect);

  return [
    Math.round(iframeRect.left + buttonRect.left + buttonRect.width / 2),
    Math.round(iframeRect.top + buttonRect.top + buttonRect.height / 2),
  ];
}

async function expectCrossOriginCacheRoundTrip(
  page: PuppeteerWebPage | PlaywrightWebPage,
  point: BrowserPoint,
) {
  const feature = await page.cacheFeatureForPoint(point);

  expect(feature.xpaths?.[0]).toContain('|>>|');
  expect(feature.xpaths?.[0]).toMatch(/iframe/);
  expect(feature.xpaths?.[0]).toMatch(/button/);

  const rect = await page.rectMatchesCacheFeature(feature);
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(Math.abs(rect.left + rect.width / 2 - point[0])).toBeLessThanOrEqual(
    3,
  );
  expect(Math.abs(rect.top + rect.height / 2 - point[1])).toBeLessThanOrEqual(
    3,
  );
}

describe('cross-origin iframe element cache', { timeout: 60_000 }, () => {
  let childServer: Server | undefined;
  let parentServer: Server | undefined;
  let parentUrl: string;

  beforeAll(async () => {
    childServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(childHtml);
    });
    const childOrigin = await listen(childServer);

    parentServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(parentHtml(`${childOrigin}/child.html`));
    });
    const parentOrigin = await listen(parentServer);
    parentUrl = `${parentOrigin}/parent.html`;
  });

  afterAll(async () => {
    await Promise.all([closeServer(parentServer), closeServer(childServer)]);
  });

  it('resolves Puppeteer cache xpaths through cross-origin iframes', async () => {
    let browser: PuppeteerBrowser | undefined;
    try {
      browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 900, height: 600, deviceScaleFactor: 1 },
        args:
          process.platform === 'win32'
            ? []
            : ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const puppeteerPage = await browser.newPage();
      await puppeteerPage.goto(parentUrl);

      const iframeHandle = (await puppeteerPage.waitForSelector(
        '#cross-origin-frame',
      )) as PuppeteerElementHandle<HTMLIFrameElement>;
      const frame = await iframeHandle.contentFrame();
      expect(frame).toBeTruthy();
      await frame!.waitForSelector('#target-button');

      const point = await pointInsideCrossOriginButton(iframeHandle, frame!);
      const midscenePage = new PuppeteerWebPage(puppeteerPage);
      await expectCrossOriginCacheRoundTrip(midscenePage, point);
    } finally {
      await browser?.close();
    }
  });

  it('resolves Playwright cache xpaths through cross-origin iframes', async () => {
    let browser: PlaywrightBrowser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 900, height: 600 },
        deviceScaleFactor: 1,
      });
      await page.goto(parentUrl);

      const iframeHandle = await page.waitForSelector('#cross-origin-frame');
      const frame = await iframeHandle.contentFrame();
      expect(frame).toBeTruthy();
      await frame!.waitForSelector('#target-button');

      const point = await pointInsideCrossOriginButton(iframeHandle, frame!);
      const midscenePage = new PlaywrightWebPage(page);
      await expectCrossOriginCacheRoundTrip(midscenePage, point);
    } finally {
      await browser?.close();
    }
  });
});
