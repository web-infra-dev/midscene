import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { describe, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

describe(
  'Search Engine Tests',
  () => {
    const ctx = createTestContext();

    const modelFamily =
      globalModelConfigManager.getModelConfig('default').modelFamily;

    it.skipIf(!modelFamily)('search engine with specific actions', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      await ctx.agent.aiInput('the search bar input', {
        value: 'AI 101',
      });
      await ctx.agent.aiTap('the search button');

      await sleep(3000);

      await ctx.agent.aiScroll('', {
        direction: 'down',
        scrollType: 'scrollToBottom',
      });

      await sleep(3000);

      const settingsButton = await ctx.agent.aiBoolean(
        'there is a settings button in the page',
      );

      if (settingsButton) {
        await ctx.agent.aiTap('the settings button', {
          deepThink: true,
        });

        await ctx.agent.aiTap('搜索设置', {
          deepThink: true,
        });

        await ctx.agent.aiTap('the close button of the popup', {
          deepThink: true,
        });

        await ctx.agent.aiAssert('there is NOT a popup shown in the page');
      }
    });

    it(
      'search engine',
      async () => {
        const { originPage, reset } = await launchPage('https://www.bing.com/');
        ctx.resetFn = reset;
        ctx.agent = new PuppeteerAgent(originPage);
        await ctx.agent.aiAct('type "AI 101" in search box');
        await ctx.agent.aiAct(
          'type "Hello world" in search box, hit Enter, wait 2s',
        );

        await ctx.agent.aiWaitFor(
          'there are some search results about "Hello world"',
        );
      },
      3 * 60 * 1000,
    );
  },
  DEFAULT_TEST_TIMEOUT,
);
