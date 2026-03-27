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
  'Pinch zoom gesture (Web)',
  () => {
    const ctx = createTestContext();

    it('Pinch action is NOT available in mouse interaction mode', async () => {
      const { originPage, reset } = await launchPage('https://www.example.com');
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const actionSpace = await ctx.agent.getActionSpace();
      const pinchAction = actionSpace.find((a) => a.name === 'Pinch');
      expect(pinchAction).toBeUndefined();
    });

    it('Swipe action is NOT available in mouse interaction mode', async () => {
      const { originPage, reset } = await launchPage('https://www.example.com');
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const actionSpace = await ctx.agent.getActionSpace();
      const swipeAction = actionSpace.find((a) => a.name === 'Swipe');
      expect(swipeAction).toBeUndefined();
    });

    it('Pinch and Swipe are available when interactionMode is touch', async () => {
      const { originPage, reset } = await launchPage('https://www.example.com');
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        interactionMode: 'touch',
      });

      const actionSpace = await ctx.agent.getActionSpace();
      const pinchAction = actionSpace.find((a) => a.name === 'Pinch');
      const swipeAction = actionSpace.find((a) => a.name === 'Swipe');
      expect(pinchAction).toBeDefined();
      expect(pinchAction!.interfaceAlias).toBe('aiPinch');
      expect(swipeAction).toBeDefined();
    });

    it('Pinch and Scroll do not conflict', async () => {
      const htmlPath = getFixturePath('pinch-scroll.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`, {
        viewport: {
          width: 375,
          height: 700,
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
        },
      });
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        interactionMode: 'touch',
      });

      // Step 1: Verify initial state
      await ctx.agent.aiAssert(
        'the scale display shows "1.00x" and "Item 1 - Top" is visible',
      );

      // Step 2: Pinch out (zoom in) on the zoom area
      await ctx.agent.aiPinch('the Pinch Zone area', {
        direction: 'out',
        distance: 200,
      });
      await sleep(1000);

      // Step 3: Verify pinch worked — scale changed
      await ctx.agent.aiAssert(
        'the scale display no longer shows "1.00x", it shows a larger number',
      );

      // Step 4: Scroll down in the scroll area — this should still work after pinch
      await ctx.agent.aiScroll('the scroll area with items', {
        direction: 'down',
        scrollType: 'scrollToBottom',
      });
      await sleep(1000);

      // Step 5: Verify scroll worked — bottom items are visible
      await ctx.agent.aiAssert('"Item 10 - Bottom" is visible on the page');

      // Step 6: Scroll back up — confirm scroll is not broken
      await ctx.agent.aiScroll('the scroll area with items', {
        direction: 'up',
        scrollType: 'scrollToTop',
      });
      await sleep(1000);

      // Step 7: Verify scroll up worked
      await ctx.agent.aiAssert('"Item 1 - Top" is visible on the page');

      // Step 8: Pinch in (zoom out) — confirm pinch still works after scrolling
      await ctx.agent.aiPinch('the Pinch Zone area', {
        direction: 'in',
        distance: 200,
      });
      await sleep(1000);

      // Step 9: Final scroll to confirm no residual conflict
      await ctx.agent.aiScroll('the scroll area with items', {
        direction: 'down',
      });
      await sleep(500);

      await ctx.agent.aiAssert(
        '"Item 1 - Top" is no longer visible, items below it are shown',
      );
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
