import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { getElementInfosScriptContent } from '@midscene/shared/node';
import { createServer } from 'http-server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

vi.setConfig({
  testTimeout: 60 * 1000,
});

describe('iframe xpath locator (puppeteer)', () => {
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
      try { await agent.destroy(); } catch { /* ignore */ }
      agent = undefined;
    }
    if (resetFn) {
      try { await resetFn(); } catch { /* ignore */ }
      resetFn = undefined;
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const scriptContent = getElementInfosScriptContent();

  it('getXpathsByPoint should return compound xpath containing |>>| for iframe element', async () => {
    const { originPage, reset } = await launchPage(`${baseUrl}/iframe-test.html`, {
      viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
    });
    resetFn = reset;
    agent = new PuppeteerAgent(originPage);

    // Wait for iframe to load
    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-btn');

    // Get iframe bounding rect
    const iframeRect = await originPage.evaluate(() => {
      const iframe = document.querySelector('#test-iframe')!;
      const rect = iframe.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });

    // Click inside iframe where the button "Submit Order" is
    // button is below h2 and p, roughly at y offset ~80 inside iframe
    const point = {
      left: Math.round(iframeRect.left + 50),
      top: Math.round(iframeRect.top + 80),
    };

    const xpaths = await agent.evaluateJavaScript(
      `${scriptContent}midscene_element_inspector.getXpathsByPoint(${JSON.stringify(point)}, true)`,
    );

    expect(xpaths).toBeDefined();
    expect(xpaths).toHaveLength(1);
    expect(xpaths[0]).toContain('|>>|');
    expect(xpaths[0]).toMatch(/iframe/);
  });

  it('getNodeInfoByXpath should resolve compound xpath to correct iframe inner element', async () => {
    const { originPage, reset } = await launchPage(`${baseUrl}/iframe-test.html`, {
      viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
    });
    resetFn = reset;
    agent = new PuppeteerAgent(originPage);

    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-text');

    // Build compound xpath manually: iframe path |>>| inner element path
    const nodeName = await agent.evaluateJavaScript(
      `${scriptContent}(function() {
        var node = midscene_element_inspector.getNodeInfoByXpath(
          '/html/body/div[2]/iframe[1]|>>|/html/body/p[1]'
        );
        return node ? node.textContent : null;
      })()`,
    );

    expect(nodeName).toBe('Hello from iframe');
  });

  it('getElementInfoByXpath should return element info with iframe offset for compound xpath', async () => {
    const { originPage, reset } = await launchPage(`${baseUrl}/iframe-test.html`, {
      viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
    });
    resetFn = reset;
    agent = new PuppeteerAgent(originPage);

    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-btn');

    // Get iframe position in top document
    const iframeRect = await originPage.evaluate(() => {
      const iframe = document.querySelector('#test-iframe')!;
      const rect = iframe.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });

    const elementInfo = await agent.evaluateJavaScript(
      `${scriptContent}midscene_element_inspector.getElementInfoByXpath(
        '/html/body/div[2]/iframe[1]|>>|/html/body/button[1]'
      )`,
    );

    expect(elementInfo).toBeDefined();
    expect(elementInfo).not.toBeNull();
    // Rect should account for iframe offset
    expect(elementInfo.rect.left).toBeGreaterThanOrEqual(Math.floor(iframeRect.left));
    expect(elementInfo.rect.top).toBeGreaterThanOrEqual(Math.floor(iframeRect.top));
    expect(elementInfo.rect.width).toBeGreaterThan(0);
    expect(elementInfo.rect.height).toBeGreaterThan(0);
  });

  it('roundtrip: getXpathsByPoint → getNodeInfoByXpath should locate the same element', async () => {
    const { originPage, reset } = await launchPage(`${baseUrl}/iframe-test.html`, {
      viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
    });
    resetFn = reset;
    agent = new PuppeteerAgent(originPage);

    await originPage.waitForSelector('#test-iframe');
    const iframeHandle = await originPage.$('#test-iframe');
    const frame = await iframeHandle!.contentFrame();
    await frame!.waitForSelector('#inner-text');

    // Get iframe rect
    const iframeRect = await originPage.evaluate(() => {
      const iframe = document.querySelector('#test-iframe')!;
      const rect = iframe.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });

    // Point inside iframe hitting #inner-text ("Hello from iframe")
    const point = {
      left: Math.round(iframeRect.left + 50),
      top: Math.round(iframeRect.top + 55),
    };

    // Step 1: get compound xpath from point
    const xpaths = await agent.evaluateJavaScript(
      `${scriptContent}midscene_element_inspector.getXpathsByPoint(${JSON.stringify(point)}, true)`,
    );

    expect(xpaths).toHaveLength(1);
    expect(xpaths[0]).toContain('|>>|');

    // Step 2: resolve xpath back to node and verify content
    const textContent = await agent.evaluateJavaScript(
      `${scriptContent}(function() {
        var node = midscene_element_inspector.getNodeInfoByXpath('${xpaths[0]}');
        return node ? node.textContent : null;
      })()`,
    );

    expect(textContent).toBeTruthy();
  });

  it('getXpathsByPoint should return plain xpath for top-level element (no |>>|)', async () => {
    const { originPage, reset } = await launchPage(`${baseUrl}/iframe-test.html`, {
      viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
    });
    resetFn = reset;
    agent = new PuppeteerAgent(originPage);

    // Click on top-level h1 "Top Level Page"
    const xpaths = await agent.evaluateJavaScript(
      `${scriptContent}midscene_element_inspector.getXpathsByPoint({left: 100, top: 20}, true)`,
    );

    expect(xpaths).toBeDefined();
    expect(xpaths).toHaveLength(1);
    // Top-level element should NOT have |>>| separator
    expect(xpaths[0]).not.toContain('|>>|');
    expect(xpaths[0]).toMatch(/^\/html/);
  });

  it('getElementInfoByXpath should return null for invalid compound xpath', async () => {
    const { originPage, reset } = await launchPage(`${baseUrl}/iframe-test.html`, {
      viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
    });
    resetFn = reset;
    agent = new PuppeteerAgent(originPage);

    const result = await agent.evaluateJavaScript(
      `${scriptContent}midscene_element_inspector.getElementInfoByXpath(
        '/html/body/iframe[99]|>>|/html/body/button[1]'
      )`,
    );

    expect(result).toBeNull();
  });
});
