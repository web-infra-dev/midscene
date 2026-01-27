import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

describe(
  'Element Interaction Tests',
  () => {
    const ctx = createTestContext();

    it('scroll', async () => {
      const htmlPath = getFixturePath('scroll.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);
      await ctx.agent.aiAct(
        'Scroll the vertical scroll area down until the "Vertical 5" tile is visible, then in the horizontal scroll area scroll right until the "Horizontal 4" tile is visible while keeping "Horizontal 2" in view',
      );
      await ctx.agent.aiAssert(
        'the "Horizontal 2", "Horizontal 4" and "Vertical 5" elements are visible',
      );
    });

    it('swipe', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`, {
        viewport: {
          width: 393,
          height: 808,
        },
      });
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      // Verify initial state
      await ctx.agent.aiAssert(
        'The swipe container shows "Panel 1 - Swipe to see more"',
      );

      const screenshot1 = await ctx.agent.page.screenshotBase64();
      await sleep(2000);
      await ctx.agent.aiAct(
        'Drag from right to left on the blue panel that shows "Panel 1" text',
      );

      // Verify content changed after swipe - the panel should no longer show Panel 1
      await ctx.agent.aiAssert(
        'The swipe container no longer shows "Panel 1", it now shows a different panel (Panel 2 or Panel 3)',
      );
      await ctx.agent.aiAssert({
        prompt: 'The content of the page is different from the reference',
        images: [
          {
            name: 'reference screenshot',
            url: screenshot1,
          },
        ],
      });
    });

    it('longPress', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`, {
        viewport: {
          width: 393,
          height: 808,
        },
      });
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      // Try multiple approaches to trigger the context menu
      await ctx.agent.aiAct('Press and hold the search button for 1 second');
      await sleep(1000);

      await ctx.agent.aiAssert('A context menu is visible on the page');
      await ctx.agent.aiAssert(
        'The context menu contains "Copy", "Paste", and "Delete" options',
      );
    });

    it('double click', async () => {
      const htmlPath = getFixturePath('double-click.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);
      await ctx.agent.aiAct('double click the "Click Me" button once');

      // The double click count should be greater than 0 (may be 1 or more depending on AI behavior)
      await ctx.agent.aiAssert(
        'the "Double" field in the "Left" section shows a number greater than 0 (not Double:0)',
      );
    });

    it('xpath', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const element = await ctx.agent.aiLocate('the "Search" button');
      const { rect } = element;

      const feature = await ctx.agent.interface.cacheFeatureForRect(rect);
      expect(feature).toBeTruthy();

      const rectFromXpath =
        await ctx.agent.interface.rectMatchesCacheFeature(feature);
      expect(rectFromXpath).toBeTruthy();

      expect(Math.abs(rectFromXpath.left - rect.left)).toBeLessThan(50);
      expect(Math.abs(rectFromXpath.top - rect.top)).toBeLessThan(50);
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
