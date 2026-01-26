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
  'Miscellaneous Tests',
  () => {
    const ctx = createTestContext();

    it('error in beforeInvokeAction', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        beforeInvokeAction: () => {
          throw new Error('this is an error in beforeInvokeAction');
        },
      });

      await expect(async () => {
        await ctx.agent!.aiAct(
          'type "standard_user" in user name input, type "secret_sauce" in password',
        );
      }).rejects.toThrowError();
    });

    it('extract the Github service status', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.githubstatus.com/',
      );
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const result = await ctx.agent.aiQuery(
        'this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}',
      );
      console.log('Github service status', result);

      expect(async () => {
        // there is no food delivery service on Github
        await ctx.agent!.aiAssert(
          'there is a "food delivery" service on page and is in normal state',
        );
      });
    });

    it.skipIf(process.env.CI)('find widgets in antd', async () => {
      const { originPage, reset } = await launchPage(
        'https://ant.design/components/form/', // will be banned by the website on CI
      );
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      await sleep(8000);
      await ctx.agent.aiAct(
        'Click the password input in the demo section on page, type "abc"',
      );

      await ctx.agent.aiAct(
        'click the "icon" on the categories on the left, sleep 5s, in the newly loaded page, type "pause" in the icon search box(it shows "search icon here")',
      );

      const names = await ctx.agent.aiQuery<string[]>(
        'find all component names in the page, return in string[]',
      );

      expect(names.length).toBeGreaterThan(5);
    });

    it('native <select /> element', async () => {
      const htmlPath = getFixturePath('select.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        forceChromeSelectRendering: true,
      });
      await ctx.agent.aiAct(
        'select the "fruit" element, select the "apple" option, sleep 2s, refresh, select the same option again. Assert: the "Current selection: Apple" text is visible. If you find it failed to select after several attempts, do not retry, it is an fatal error',
      );
    });

    it('input xss content', async () => {
      const { originPage, reset } = await launchPage('https://www.google.com/');
      ctx.agent = new PuppeteerAgent(originPage);
      await ctx.agent.aiInput(
        '<html>hello world</html><script>alert("xss")</script><button>click me</button>',
        'the search box',
      );
      await reset();

      const reportFile = ctx.agent.reportFile;
      const reportPage = await launchPage(`file://${reportFile}`);
      const reportAgent = new PuppeteerAgent(reportPage.originPage);
      await reportAgent.aiAssert('there is a sidebar in the page');
      ctx.resetFn = reportPage.reset;
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
