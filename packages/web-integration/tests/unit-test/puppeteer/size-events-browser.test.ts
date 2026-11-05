import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PuppeteerBrowserAgent,
  PuppeteerPageAgent,
  PuppeteerWebPage,
} from '@/puppeteer';
import type { ServiceDump } from '@midscene/core';
import { commonContextParser } from '@midscene/core/agent';
import { setMidsceneRunDir } from '@midscene/shared/common';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { afterAll, beforeAll, describe, expect, it, rs } from '@rstest/core';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const AGENT_OPTIONS = {
  generateReport: false,
  forceChromeSelectRendering: false,
  waitForActionReady: async () => {},
  modelConfig: {
    MIDSCENE_MODEL_NAME: 'size-events-test',
    MIDSCENE_MODEL_API_KEY: 'test-key',
    MIDSCENE_MODEL_BASE_URL: 'https://model.invalid/v1',
    MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl' as const,
  },
};
const URL = `data:text/html,${encodeURIComponent('<!doctype html><button style="position:fixed;left:400px;top:90px;width:108px;height:40px" onclick="this.dataset.clicked=\'yes\'">Target</button>')}`;

// Event delivery is explicitly awaited: this enhancement does not promise
// recovery for a screenshot racing a resize notification that has not arrived.
async function waitForWidth(page: Page, width: number) {
  for (let i = 0; i < 100; i++) {
    if (page.viewport()?.width === width) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(page.viewport()?.width).toBe(width);
}

async function externalResize(
  page: Page,
  width: number,
  height = 600,
  dpr = 1,
) {
  const cdp = await page.createCDPSession();
  // Keep the independent session alive until page.close(), like an external
  // controller that owns its emulation settings during the handoff.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: false,
  });
}

describe('Puppeteer resize events in Chromium', () => {
  let browser: Browser;
  let runDir: string;
  beforeAll(async () => {
    runDir = mkdtempSync(join(tmpdir(), 'midscene-size-events-'));
    setMidsceneRunDir(runDir);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
      defaultViewport: { width: 1440, height: 1000 },
    });
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    setMidsceneRunDir(undefined);
    if (runDir) rmSync(runDir, { recursive: true, force: true });
  });
  async function fixture() {
    const page = await browser.newPage();
    await page.goto(URL);
    return page;
  }

  it.each([1, 1.3, 2])(
    'recovers external width/height changes and direct aiTap with DPR=%s',
    async (dpr) => {
      const page = await fixture();
      const agent = new PuppeteerPageAgent(page, {
        ...AGENT_OPTIONS,
        forceSameTabNavigation: false,
      });
      const originalInterface = agent.interface;
      const originalCache = agent.taskCache;
      const originalDump = agent.dump;
      rs.spyOn(agent.service, 'locate').mockResolvedValue({
        element: {
          center: [454 * dpr, 110 * dpr],
          description: 'target button',
        },
        dump: {} as ServiceDump,
      });
      try {
        await agent.interface.size();
        await externalResize(page, 800, 600, dpr);
        await waitForWidth(page, 800);
        await agent.aiTap('Target button', { cacheable: false });
        expect(
          await page.$eval('button', (button) =>
            button.getAttribute('data-clicked'),
          ),
        ).toBe('yes');
        expect(agent.interface).toBe(originalInterface);
        expect(agent.taskCache).toBe(originalCache);
        expect(agent.dump).toBe(originalDump);
        await expect(agent.interface.size()).resolves.toEqual({
          width: 800,
          height: 600,
        });
        expect(
          await imageInfoOfBase64(await agent.interface.screenshotBase64()),
        ).toMatchObject({
          width: Math.round(800 * dpr),
          height: Math.round(600 * dpr),
        });
      } finally {
        await agent.destroy();
        await page.close();
      }
    },
  );

  it('synchronizes an already mismatched page when the listener is installed', async () => {
    const page = await fixture();
    await externalResize(page, 800);
    expect(page.viewport()?.width).toBe(1440);
    const adapter = new PuppeteerWebPage(page);
    try {
      await expect(adapter.size()).resolves.toEqual({
        width: 800,
        height: 600,
      });
      expect(page.viewport()?.width).toBe(800);
    } finally {
      await adapter.destroy();
      await page.close();
    }
  });

  it('performs no metric reads or viewport writes during stable observations', async () => {
    const page = await fixture();
    const adapter = new PuppeteerWebPage(page);
    try {
      await adapter.size();
      const evaluate = rs.spyOn(page, 'evaluate');
      const setViewport = rs.spyOn(page, 'setViewport');
      const screenshot = rs.spyOn(page, 'screenshot');
      for (let i = 0; i < 3; i++) await commonContextParser(adapter, {});
      expect(evaluate).not.toHaveBeenCalled();
      expect(setViewport).not.toHaveBeenCalled();
      expect(screenshot).toHaveBeenCalledTimes(3);
      evaluate.mockRestore();
      setViewport.mockRestore();
      screenshot.mockRestore();
    } finally {
      await adapter.destroy();
      await page.close();
    }
  });

  it('reinstalls the listener after navigation', async () => {
    const page = await fixture();
    const adapter = new PuppeteerWebPage(page);
    try {
      await adapter.size();
      await page.goto(`${URL}#next`);
      // A fragment navigation does not replace the document; reload does.
      await page.reload();
      await externalResize(page, 850);
      await waitForWidth(page, 850);
      await expect(adapter.size()).resolves.toEqual({
        width: 850,
        height: 600,
      });
    } finally {
      await adapter.destroy();
      await page.close();
    }
  });

  it('follows BrowserAgent page switches and detaches the old listener', async () => {
    const first = await fixture();
    const second = await fixture();
    const agent = new PuppeteerBrowserAgent(browser, first, AGENT_OPTIONS);
    try {
      await agent.interface.size();
      await agent.setActivePage(second);
      await agent.interface.size();
      await externalResize(second, 900);
      await waitForWidth(second, 900);
      await first.bringToFront();
      await externalResize(first, 700);
      await first.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      expect(first.viewport()?.width).toBe(1440);
      await expect(agent.interface.size()).resolves.toEqual({
        width: 900,
        height: 600,
      });
    } finally {
      await agent.destroy();
      await first.close();
      await second.close();
    }
  });

  it('cleans up only its own listener when two adapters share a page', async () => {
    const page = await fixture();
    const first = new PuppeteerWebPage(page);
    const second = new PuppeteerWebPage(page);
    try {
      await Promise.all([first.size(), second.size()]);
      await first.destroy();
      await externalResize(page, 800);
      await waitForWidth(page, 800);
      await expect(second.size()).resolves.toEqual({ width: 800, height: 600 });
      await second.destroy();
      await externalResize(page, 700);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      expect(page.viewport()?.width).toBe(800);
      expect(
        await page.evaluate(() =>
          Object.keys(window).filter(
            (name) =>
              name.startsWith('__midscene_resize_') &&
              typeof (window as unknown as Record<string, unknown>)[name] ===
                'function',
          ),
        ),
      ).toEqual([]);
    } finally {
      await first.destroy();
      await second.destroy();
      await page.close();
    }
  });
});
