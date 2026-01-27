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
  'Tab Navigation Tests',
  () => {
    const ctx = createTestContext();

    it('not tracking active tab', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: false,
      });
      await ctx.agent.aiAct('Click on the "Open in New Tab" link');
      await sleep(3000);

      // When forceSameTabNavigation is false, the agent should NOT follow the new tab
      // So the weather forecast (which appears in the new tab) should NOT be visible
      await expect(async () => {
        await ctx.agent!.aiAssert('There is a weather forecast in the page');
      }).rejects.toThrowError();
    });

    it('tracking active tab', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: true,
      });
      await ctx.agent.aiAct('Click on the "Open in New Tab" link');

      // When forceSameTabNavigation is true, the agent should follow the new tab
      await ctx.agent.aiWaitFor('There is a weather forecast in the page');
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
