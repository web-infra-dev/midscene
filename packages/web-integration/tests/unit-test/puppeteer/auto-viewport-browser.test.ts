import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PuppeteerBrowserAgent,
  PuppeteerPageAgent,
  PuppeteerWebPage,
} from '@/puppeteer';
import { PuppeteerPageOwnership } from '@/puppeteer/page-ownership';
import type { ServiceDump } from '@midscene/core';
import { TaskCache, commonContextParser } from '@midscene/core/agent';
import { setMidsceneRunDir } from '@midscene/shared/common';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { afterAll, beforeAll, describe, expect, it, rs } from '@rstest/core';
import {
  type Browser as PlaywrightBrowser,
  type Page as PlaywrightPage,
  chromium,
} from 'playwright';
import puppeteer, { type Browser } from 'puppeteer';

const AGENT_OPTIONS = {
  generateReport: false,
  forceSameTabNavigation: false,
  forceChromeSelectRendering: false,
  waitForActionReady: async () => {},
  modelConfig: {
    MIDSCENE_MODEL_NAME: 'viewport-sync-test',
    MIDSCENE_MODEL_API_KEY: 'test-key',
    MIDSCENE_MODEL_BASE_URL: 'https://model.invalid/v1',
    MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl' as const,
  },
};

const HTML = `<!doctype html><html><head><style>
  body { margin: 0; min-height: 3000px; }
  input { position: fixed; top: 20px; left: 20px; }
  button { position: fixed; width: 108px; height: 40px; }
  #target { left: 400px; top: 90px; }
  #responsive { right: 20px; top: 170px; }
</style></head><body>
  <input id="draft" value="unsaved draft">
  <button id="target" onclick="this.dataset.clicks = String(Number(this.dataset.clicks || 0) + 1)">Target</button>
  <button id="responsive" onclick="this.dataset.clicks = String(Number(this.dataset.clicks || 0) + 1)">Responsive</button>
</body></html>`;

describe('Automatic Puppeteer viewport calibration in Chromium', () => {
  let browser: Browser;
  let peer: PlaywrightBrowser;
  let runDir: string;

  beforeAll(async () => {
    runDir = mkdtempSync(join(tmpdir(), 'midscene-auto-viewport-'));
    setMidsceneRunDir(runDir);
    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    peer = await chromium.connectOverCDP(browser.wsEndpoint());
  }, 120_000);

  afterAll(async () => {
    await peer?.close();
    await browser?.close();
    setMidsceneRunDir(undefined);
    if (runDir) rmSync(runDir, { recursive: true, force: true });
  }, 120_000);

  async function fixture(deviceScaleFactor = 1) {
    const [page, peerPage] = await Promise.all([
      browser.newPage(),
      peer.contexts()[0].waitForEvent('page'),
    ]);
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor });
    await page.goto(`data:text/html,${encodeURIComponent(HTML)}`);
    return { page, peerPage };
  }

  async function resize(peerPage: PlaywrightPage) {
    await peerPage.setViewportSize({ width: 800, height: 600 });
  }

  it.each([1, 1.3, 2])(
    'repairs screenshot scaling and aiTap after a Playwright handoff (DPR=%s)',
    async (dpr) => {
      const { page, peerPage } = await fixture(dpr);
      const agent = new PuppeteerPageAgent(page, {
        ...AGENT_OPTIONS,
        cache: { id: randomUUID(), strategy: 'read-only' },
      });
      // Model coordinates are physical screenshot pixels, independent of SDK ratios.
      rs.spyOn(agent.service, 'locate').mockResolvedValue({
        element: {
          center: [454 * dpr, 110 * dpr],
          description: 'target button',
        },
        dump: {} as ServiceDump,
      });
      const onDumpUpdate = rs.fn();
      agent.onDumpUpdate = onDumpUpdate;
      const originalInterface = agent.interface;
      const originalCache = agent.taskCache;
      const originalDump = agent.dump;
      const reportFileName = agent.reportFileName;
      const documentHandle = await page.evaluateHandle(() => document);
      const metricSession = await peerPage.context().newCDPSession(peerPage);
      try {
        await page.evaluate(() => window.scrollTo(0, 200));
        await resize(peerPage);
        await metricSession.send('Emulation.setDeviceMetricsOverride', {
          width: 800,
          height: 600,
          deviceScaleFactor: dpr,
          mobile: false,
        });
        await expect(agent.interface.size()).resolves.toEqual({
          width: 800,
          height: 600,
        });
        expect(page.viewport()?.width).toBe(1440);

        // A normal observation must repair the handoff without an explicit sync call.
        const listeners = browser.listenerCount('targetcreated');
        await commonContextParser(agent.interface, {});
        expect(agent.interface).toBe(originalInterface);
        expect(agent.interface.underlyingPage).toBe(page);
        expect(agent.taskCache).toBe(originalCache);
        expect(agent.dump).toBe(originalDump);
        expect(agent.reportFileName).toBe(reportFileName);
        expect(agent.onDumpUpdate).toBe(onDumpUpdate);
        expect(browser.listenerCount('targetcreated')).toBe(listeners);
        expect(
          await page.evaluate(
            (original) => original === document,
            documentHandle,
          ),
        ).toBe(true);
        expect(
          await page.$eval(
            '#draft',
            (input) => (input as HTMLInputElement).value,
          ),
        ).toBe('unsaved draft');
        expect(await page.evaluate(() => window.scrollY)).toBe(200);

        const context = await commonContextParser(agent.interface, {});
        expect(context.shotSize).toMatchObject({
          width: Math.round(800 * dpr),
          height: Math.round(600 * dpr),
        });
        expect(context.shrunkShotToLogicalRatio).toBeCloseTo(dpr);
        const callbacksBefore = onDumpUpdate.mock.calls.length;
        await agent.aiTap('target button', { cacheable: false });
        expect(
          await page.$eval('#target', (button) =>
            button.getAttribute('data-clicks'),
          ),
        ).toBe('1');
        expect(onDumpUpdate.mock.calls.length).toBeGreaterThan(callbacksBefore);
      } finally {
        await documentHandle.dispose();
        await metricSession.detach();
        await agent.destroy();
        await page.close();
      }
    },
  );

  it('keeps retained UI calls and subscriptions usable across repeated handoffs', async () => {
    const { page, peerPage } = await fixture();
    const agent = new PuppeteerPageAgent(page, AGENT_OPTIONS);
    const retainedAgent = agent;
    const retainedInterface = agent.interface;
    const retainedTap = agent.aiTap.bind(agent);
    const originalCache = agent.taskCache;
    const originalDump = agent.dump;
    const originalReportFileName = agent.reportFileName;
    const originalModelConfig = agent.modelConfigManager;
    const onDumpUpdate = rs.fn();
    const unsubscribe = agent.addDumpUpdateListener(onDumpUpdate);
    rs.spyOn(agent.service, 'locate').mockResolvedValue({
      element: { center: [454, 110], description: 'target button' },
      dump: {} as ServiceDump,
    });
    try {
      await agent.interface.size();
      for (const [index, viewport] of [
        { width: 800, height: 600 },
        { width: 1920, height: 1080 },
      ].entries()) {
        await peerPage.setViewportSize(viewport);
        const callbacksBefore = onDumpUpdate.mock.calls.length;
        await retainedTap('target button', { cacheable: false });
        expect(
          await page.$eval('#target', (button) =>
            button.getAttribute('data-clicks'),
          ),
        ).toBe(String(index + 1));
        expect(onDumpUpdate.mock.calls.length).toBeGreaterThan(callbacksBefore);
        expect(retainedAgent).toBe(agent);
        expect(agent.interface).toBe(retainedInterface);
        expect(agent.taskCache).toBe(originalCache);
        expect(agent.dump).toBe(originalDump);
        expect(agent.reportFileName).toBe(originalReportFileName);
        expect(agent.modelConfigManager).toBe(originalModelConfig);
        await expect(retainedInterface.size()).resolves.toEqual(viewport);
      }
      unsubscribe();
      onDumpUpdate.mockClear();
      await retainedTap('target button', { cacheable: false });
      expect(onDumpUpdate).not.toHaveBeenCalled();
      expect(
        await page.$eval('#target', (button) =>
          button.getAttribute('data-clicks'),
        ),
      ).toBe('3');
    } finally {
      unsubscribe();
      await agent.destroy();
      await page.close();
    }
  });

  it('keeps a persisted XPath cache usable when responsive layout moves the target', async () => {
    const { page, peerPage } = await fixture();
    const cacheId = randomUUID();
    const seed = new TaskCache(cacheId, true);
    seed.appendCache({
      type: 'locate',
      prompt: 'responsive button',
      cache: { xpaths: ['//*[@id="responsive"]'] },
    });
    const agent = new PuppeteerPageAgent(page, {
      ...AGENT_OPTIONS,
      cache: { id: cacheId, strategy: 'read-only' },
    });
    const locate = rs
      .spyOn(agent.service, 'locate')
      .mockRejectedValue(new Error('The existing XPath cache should be used'));
    const originalCache = agent.taskCache;
    try {
      await agent.interface.size();
      await resize(peerPage);
      expect(agent.taskCache).toBe(originalCache);
      await agent.aiTap('responsive button');
      expect(locate).not.toHaveBeenCalled();
      expect(
        await page.$eval('#responsive', (button) =>
          button.getAttribute('data-clicks'),
        ),
      ).toBe('1');
    } finally {
      await agent.destroy();
      await page.close();
    }
  });

  it('refreshes cached dimensions after a Puppeteer-only resize without resizing again', async () => {
    const { page } = await fixture();
    const adapter = new PuppeteerWebPage(page);
    try {
      await adapter.size();
      await page.setViewport({ width: 800, height: 600 });
      const setViewport = rs.spyOn(page, 'setViewport');
      await commonContextParser(adapter, {});
      await expect(adapter.size()).resolves.toEqual({
        width: 800,
        height: 600,
      });
      expect(setViewport).not.toHaveBeenCalled();
      setViewport.mockRestore();
    } finally {
      await page.close();
    }
  });

  it.each([0, 1])(
    'handles an external DPR-only change from configured DPR=%s',
    async (configuredDpr) => {
      const { page, peerPage } = await fixture(configuredDpr);
      const adapter = new PuppeteerWebPage(page);
      const cdp = await peerPage.context().newCDPSession(peerPage);
      try {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: 1440,
          height: 1000,
          deviceScaleFactor: 2,
          mobile: false,
        });
        await commonContextParser(adapter, {});
        const image = await imageInfoOfBase64(await adapter.screenshotBase64());
        expect(image).toMatchObject({ width: 2880, height: 2000 });
        const stable = rs.spyOn(page, 'setViewport');
        await commonContextParser(adapter, {});
        expect(stable).not.toHaveBeenCalled();
        stable.mockRestore();
      } finally {
        await cdp.detach();
        await page.close();
      }
    },
  );

  it('resolves system-default DPR once using the live browser value', async () => {
    const { page } = await fixture(0);
    const adapter = new PuppeteerWebPage(page);
    const setViewport = rs.spyOn(page, 'setViewport');
    try {
      await commonContextParser(adapter, {});
      expect(page.viewport()?.deviceScaleFactor).toBe(
        await page.evaluate(() => window.devicePixelRatio),
      );
      expect(setViewport).toHaveBeenCalledOnce();
      await commonContextParser(adapter, {});
      expect(setViewport).toHaveBeenCalledOnce();
    } finally {
      setViewport.mockRestore();
      await page.close();
    }
  });

  it('preserves native viewport mode', async () => {
    const { page, peerPage } = await fixture();
    await page.setViewport(null);
    const adapter = new PuppeteerWebPage(page);
    try {
      await adapter.size();
      await resize(peerPage);
      const setViewport = rs.spyOn(page, 'setViewport');
      await commonContextParser(adapter, {});
      expect(page.viewport()).toBeNull();
      expect(setViewport).not.toHaveBeenCalled();
      await expect(adapter.size()).resolves.toEqual({
        width: 800,
        height: 600,
      });
      expect(
        await imageInfoOfBase64(await adapter.screenshotBase64()),
      ).toMatchObject({ width: 800, height: 600 });
      setViewport.mockRestore();
    } finally {
      await page.close();
    }
  });

  it('synchronizes the BrowserAgent active page without widening page ownership', async () => {
    const { page, peerPage } = await fixture();
    const unrelatedPage = await browser.newPage();
    const ownership = new PuppeteerPageOwnership(page);
    const { forceSameTabNavigation, ...browserAgentOptions } = AGENT_OPTIONS;
    const agent = new PuppeteerBrowserAgent(
      browser,
      page,
      browserAgentOptions,
      ownership,
    );
    const originalInterface = agent.interface;
    try {
      const secondPage = await agent.newPage();
      await agent.interface.size();
      await agent.setActivePage(page);
      await resize(peerPage);
      const listeners = browser.listenerCount('targetcreated');
      await commonContextParser(agent.interface, {});
      expect(agent.activePage).toBe(page);
      expect(agent.interface).toBe(originalInterface);
      expect(await agent.pages()).toEqual(
        expect.arrayContaining([page, secondPage]),
      );
      expect(await agent.pages()).not.toContain(unrelatedPage);
      await expect(agent.setActivePage(unrelatedPage)).rejects.toThrow();
      expect(browser.listenerCount('targetcreated')).toBe(listeners);
    } finally {
      await agent.destroy();
      await ownership.close();
      expect(unrelatedPage.isClosed()).toBe(false);
      expect(browser.connected).toBe(true);
      await unrelatedPage.close();
    }
  });
  it('recovers a direct SDK call after an inspector connects with Puppeteer defaults', async () => {
    const { page } = await fixture();
    const agent = new PuppeteerPageAgent(page, AGENT_OPTIONS);
    rs.spyOn(agent.service, 'locate').mockResolvedValue({
      element: { center: [454, 110], description: 'target button' },
      dump: {} as ServiceDump,
    });
    let inspector: Browser | undefined;
    try {
      await agent.interface.size();
      inspector = await puppeteer.connect({
        browserWSEndpoint: browser.wsEndpoint(),
      });
      await inspector.pages();
      expect(await page.evaluate(() => window.innerWidth)).toBe(800);
      expect(page.viewport()?.width).toBe(1440);
      await agent.aiTap('target button', { cacheable: false });
      expect(
        await page.$eval('#target', (button) =>
          button.getAttribute('data-clicks'),
        ),
      ).toBe('1');
      expect(page.viewport()?.width).toBe(800);
    } finally {
      await inspector?.disconnect();
      await agent.destroy();
      await page.close();
    }
  });

  it('discards a frame resized during capture instead of passing it to the model', async () => {
    const { page, peerPage } = await fixture();
    const adapter = new PuppeteerWebPage(page);
    const originalScreenshot = page.screenshot.bind(page);
    const screenshot = rs
      .spyOn(page, 'screenshot')
      .mockImplementationOnce(async (...args) => {
        const image = await originalScreenshot(...args);
        await peerPage.setViewportSize({ width: 800, height: 600 });
        return image;
      });
    try {
      await expect(commonContextParser(adapter, {})).rejects.toThrow(
        'viewport changed',
      );
      screenshot.mockRestore();
      const context = await commonContextParser(adapter, {});
      expect(context.shotSize).toMatchObject({ width: 800, height: 600 });
    } finally {
      screenshot.mockRestore();
      await page.close();
    }
  });
});
