import { WebPage } from '@/playwright/page';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { expect, test } from '@rstest/core';
import { type Page as PlaywrightPage, chromium } from 'playwright';
import puppeteer, { type Page as PuppeteerPage } from 'puppeteer';

for (const adapter of ['Playwright', 'Puppeteer'] as const) {
  test(`${adapter} dispatches a trusted middle click without a left click`, async () => {
    const options = {
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    const browser =
      adapter === 'Playwright'
        ? await chromium.launch(options)
        : await puppeteer.launch(options);
    try {
      const tab = await browser.newPage();
      const realm: { evaluate<T>(fn: () => T): Promise<Awaited<T>> } = tab;
      await tab.setContent(
        '<button style="position:fixed;left:0;top:0;width:200px;height:200px">target</button>',
      );
      await realm.evaluate(() => {
        const events: Array<{
          type: string;
          button: number;
          trusted: boolean;
        }> = [];
        (window as unknown as { events: typeof events }).events = events;
        for (const type of ['mousedown', 'mouseup', 'auxclick', 'click']) {
          document.querySelector('button')!.addEventListener(type, (event) => {
            const mouse = event as MouseEvent;
            events.push({
              type,
              button: mouse.button,
              trusted: mouse.isTrusted,
            });
            event.preventDefault();
          });
        }
      });
      // Each constructor accepts its own browser's Page, whose generic APIs differ.
      const web =
        adapter === 'Playwright'
          ? new WebPage(tab as PlaywrightPage)
          : new PuppeteerWebPage(tab as PuppeteerPage);
      const action = web
        .actionSpace()
        .find((item) => item.name === 'MiddleClick');
      expect(action).toBeDefined();
      await action!.call(
        { locate: { center: [50, 50] } },
        {
          task: {
            type: 'Action Space',
            taskId: 'middle-click',
            status: 'running',
            executor: async () => {},
          },
        },
      );
      expect(
        await realm.evaluate(
          () => (window as unknown as { events: unknown[] }).events,
        ),
      ).toEqual([
        { type: 'mousedown', button: 1, trusted: true },
        { type: 'mouseup', button: 1, trusted: true },
        { type: 'auxclick', button: 1, trusted: true },
      ]);
    } finally {
      await browser.close();
    }
  });
}
