import { pathToFileURL } from 'node:url';
import { PuppeteerAgent } from '@/puppeteer';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  rs,
} from '@rstest/core';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { getFixturePath } from './test-utils';

rs.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });

describe('searching for off-screen controls', () => {
  let agent: PuppeteerAgent | undefined;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
      ignoreDefaultArgs: ['--hide-scrollbars'],
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  afterEach(async () => {
    try {
      await agent?.destroy();
    } finally {
      agent = undefined;
      await page?.close();
    }
  });

  it.each([
    { axis: 'horizontal', afterScrolls: 2 },
    { axis: 'horizontal', afterScrolls: 3 },
    { axis: 'vertical', afterScrolls: 2 },
    { axis: 'vertical', afterScrolls: 3 },
  ])(
    'finds and clicks Next in a $axis scrollable form with interval $afterScrolls',
    async ({ axis, afterScrolls }) => {
      const url = pathToFileURL(getFixturePath('scroll-search.html'));
      url.searchParams.set('axis', axis);
      page = await browser.newPage();
      await page.setViewport({ width: 1000, height: 720 });
      await page.goto(url.toString());
      const initiallyHidden = await page.$eval('#next', (button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= innerWidth || rect.top >= innerHeight;
      });
      expect(initiallyHidden).toBe(true);
      const offsets: { x: number; y: number }[] = [];
      agent = new PuppeteerAgent(page, {
        generateReport: true,
        reportFileName: `scroll-search-${axis}-${afterScrolls}`,
        replanningCycleLimit: 8,
        afterInvokeAction: async (name, param) => {
          const offset = await page.$eval('#content', (el) => ({
            x: el.scrollLeft,
            y: el.scrollTop,
          }));
          offsets.push(offset);
          console.log(
            'SCROLL_SEARCH_ACTION',
            axis,
            name,
            JSON.stringify(param),
            offset,
          );
        },
      });

      await agent.aiAct(
        'Continue configuring this evaluation task by clicking Next.',
        { scrollRecovery: { afterScrolls } },
      );

      expect(await page.$eval('#result', (el) => el.textContent)).toBe(
        'Dataset configuration',
      );
      expect(
        offsets.some(
          (offset) => (axis === 'horizontal' ? offset.x : offset.y) > 0,
        ),
      ).toBe(true);
    },
  );

  it.each([1, 2])('respects %s explicit downward scrolls', async (times) => {
    const url = pathToFileURL(getFixturePath('scroll-search.html'));
    url.searchParams.set('axis', 'vertical');
    page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 720 });
    await page.goto(url.toString());
    const actions: { name: string; distance?: number; direction?: string }[] =
      [];
    const scrollDirections: string[] = [];
    agent = new PuppeteerAgent(page, {
      generateReport: true,
      reportFileName:
        times === 1
          ? 'scroll-search-explicit-down'
          : 'scroll-search-explicit-down-twice',
      afterInvokeAction: async (name, param) => {
        actions.push({
          name,
          distance: param?.distance,
          direction: param?.direction,
        });
        if (name === 'Scroll') scrollDirections.push(param.direction);
      },
    });

    await agent.aiAct(
      `Scroll down ${times === 1 ? 'once' : 'twice'} by 200 pixels each time in the main content area, then stop.`,
      { scrollRecovery: true },
    );

    const offset = await page.$eval('#content', (el) => ({
      x: el.scrollLeft,
      y: el.scrollTop,
    }));
    expect(scrollDirections).toEqual(Array(times).fill('down'));
    expect(actions).toEqual(
      Array.from({ length: times }, () => ({
        name: 'Scroll',
        distance: 200,
        direction: 'down',
      })),
    );
    expect(offset.y).toBeCloseTo(times * 200, 0);
    expect(offset.y).toBeGreaterThan(0);
    expect(offset.x).toBe(0);
    expect(await page.$eval('#result', (el) => el.textContent)).toBe('');
  });
});
