import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it } from 'vitest';
import {
  LONG_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

/**
 * These tests are skipped by default because they are long-running
 * or require specific setup. They are kept here for manual testing.
 */
describe(
  'Skipped Tests (Long Running)',
  () => {
    const ctx = createTestContext();

    it.skip(
      'long task',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://www.github.com/signup',
          {
            headless: false,
          },
        );
        ctx.resetFn = reset;
        ctx.agent = new PuppeteerAgent(originPage);

        await sleep(10 * 1000);

        await ctx.agent.aiAct(
          '在当前页面里完成这个任务：完成 github 账号注册的表单填写。地区必须选择「加拿大」。确保表单上没有遗漏的字段，确保所有的表单项能够通过校验。 只需要填写表单项即可，不需要发起真实的账号注册。 最终请返回表单上实际填写的字段内容。',
          {
            deepThink: true,
          },
        );
      },
      LONG_TEST_TIMEOUT,
    );

    it.skip(
      'drag and drop',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://cpstest.org/drag-test.php',
          {
            headless: false,
          },
        );
        ctx.resetFn = reset;
        ctx.agent = new PuppeteerAgent(originPage);

        await sleep(10 * 1000);

        const result = await ctx.agent.aiAct(
          '按住"dragMe"元素，往右拖动300像素。结束后，告诉我左上角网站的名字，全小写，如 example.com ',
        );

        expect(result).toBe('cpstest.org');
      },
      LONG_TEST_TIMEOUT,
    );

    it.skip(
      'take note',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://www.baidu.com/',
          {
            headless: false,
          },
        );
        ctx.resetFn = reset;
        ctx.agent = new PuppeteerAgent(originPage);

        await sleep(10 * 1000);

        await ctx.agent.aiAct(
          '看下百度热搜的第五条标题（看一下，不用点击），查一下北京天气，再查下杭州天气，去 bing.com ，搜索关键字是百度热搜第五条 + 上海的最高气温',
        );
      },
      LONG_TEST_TIMEOUT,
    );

    it.skip('Playground', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);
      await ctx.agent.aiAct(
        'Type "AI 101" in search box, hit Enter, wait 2s. If there is a cookie prompt, close it',
      );
    });
  },
  LONG_TEST_TIMEOUT,
);
