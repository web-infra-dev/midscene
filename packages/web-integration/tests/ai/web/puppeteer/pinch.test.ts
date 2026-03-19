import { PuppeteerAgent } from '@/puppeteer';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_TIMEOUT, createTestContext } from './test-utils';
import { launchPage } from './utils';

describe(
  'Pinch zoom gesture (Web)',
  () => {
    const ctx = createTestContext();

    it.skipIf(!!process.env.CI)(
      'Pinch: zoom in on Google Maps via aiAct',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://www.google.com/maps',
          {
            viewport: {
              width: 375,
              height: 812,
              isMobile: true,
              hasTouch: true,
              deviceScaleFactor: 3,
            },
          },
        );
        ctx.resetFn = reset;
        ctx.agent = new PuppeteerAgent(originPage, {
          enableTouchEventsInActionSpace: true,
        });

        await ctx.agent.aiAct('pinch to zoom in on the map');
      },
    );

    it.skipIf(!!process.env.CI)('Pinch: use aiPinch API directly', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.google.com/maps',
        {
          viewport: {
            width: 375,
            height: 812,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 3,
          },
        },
      );
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        enableTouchEventsInActionSpace: true,
      });

      // pinch out = zoom in, pinch in = zoom out
      await ctx.agent.aiPinch(undefined, { direction: 'out', distance: 200 });
      await ctx.agent.aiPinch(undefined, { direction: 'in', distance: 200 });
    });

    it('Pinch action is not available without enableTouchEventsInActionSpace', async () => {
      const { originPage, reset } = await launchPage('https://www.example.com');
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const actionSpace = await ctx.agent.getActionSpace();
      const pinchAction = actionSpace.find((a) => a.name === 'Pinch');
      expect(pinchAction).toBeUndefined();
    });

    it('Pinch action is available with enableTouchEventsInActionSpace', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.example.com',
        {
          viewport: {
            width: 375,
            height: 812,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 3,
          },
        },
      );
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        enableTouchEventsInActionSpace: true,
      });

      const actionSpace = await ctx.agent.getActionSpace();
      const pinchAction = actionSpace.find((a) => a.name === 'Pinch');
      expect(pinchAction).toBeDefined();
      expect(pinchAction!.interfaceAlias).toBe('aiPinch');
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
