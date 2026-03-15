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

    it('auto switch to new tab', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: false,
      });
      await ctx.agent.aiTap('the "Open in New Tab" link', {
        deepThink: true,
      });
      await sleep(3000);

      // When forceSameTabNavigation is false, the agent should automatically
      // switch to the newly opened tab so subsequent actions operate on it
      await ctx.agent.aiWaitFor('There is a weather forecast in the page');
    });

    it('tracking active tab', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: true,
      });
      await ctx.agent.aiTap('the "Open in New Tab" link', {
        deepThink: true,
      });

      // When forceSameTabNavigation is true, the agent should follow the new tab
      await ctx.agent.aiWaitFor('There is a weather forecast in the page');
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
