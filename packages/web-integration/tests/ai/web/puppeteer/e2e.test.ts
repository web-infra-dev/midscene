import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

describe(
  'puppeteer integration',
  () => {
    let resetFn: () => Promise<void>;
    let agent: PuppeteerAgent;
    afterEach(async () => {
      if (agent) {
        try {
          await agent.destroy();
        } catch (e) {
          console.warn('agent destroy error', e);
        }
      }
      if (resetFn) {
        try {
          await resetFn();
        } catch (e) {
          console.warn('resetFn error');
          console.warn(e);
        }
      }
    });

    it.skip(
      'long task',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://www.github.com/signup',
          {
            headless: false,
          },
        );
        resetFn = reset;
        agent = new PuppeteerAgent(originPage);

        await sleep(10 * 1000);

        await agent.aiAct(
          '在当前页面里完成这个任务：完成 github 账号注册的表单填写。地区必须选择「加拿大」。确保表单上没有遗漏的字段，确保所有的表单项能够通过校验。 只需要填写表单项即可，不需要发起真实的账号注册。 最终请返回表单上实际填写的字段内容。',
          // '在当前页面里完成这个任务：用户名填入 abc，密码填入 123 , 点击 email 字段。断言：界面上有抛错',
        );
      },
      15 * 60 * 1000,
    );

    it.only(
      'long task',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://cpstest.org/drag-test.php',
          {
            headless: false,
          },
        );
        resetFn = reset;
        agent = new PuppeteerAgent(originPage);

        await sleep(10 * 1000);

        await agent.aiAct(
          // '在当前页面里完成这个任务：完成 github 账号注册的表单填写。地区必须选择「加拿大」。确保表单上没有遗漏的字段，确保所有的表单项能够通过校验。 只需要填写表单项即可，不需要发起真实的账号注册。 最终请返回表单上实际填写的字段内容。',
          // '在当前页面里完成这个任务：用户名填入 abc，密码填入 123 , 点击 email 字段。断言：界面上有抛错',
          '按住“dragMe”元素，往右拖动300像素',
          {
            deepThink: true,
          },
        );
      },
      15 * 60 * 1000,
    );

    it('error in beforeInvokeAction', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      resetFn = reset;
      agent = new PuppeteerAgent(originPage, {
        beforeInvokeAction: () => {
          throw new Error('this is an error in beforeInvokeAction');
        },
      });

      await expect(async () => {
        await agent.aiAct(
          'type "standard_user" in user name input, type "secret_sauce" in password',
        );
      }).rejects.toThrowError();
    });

    it.skip('Sauce Demo by Swag Lab', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      resetFn = reset;
      const onTaskStartTip = vi.fn();
      const beforeInvokeAction = vi.fn();
      const afterInvokeAction = vi.fn();
      agent = new PuppeteerAgent(originPage, {
        cacheId: 'puppeteer(Sauce Demo by Swag Lab)',
        onTaskStartTip,
        beforeInvokeAction,
        afterInvokeAction,
      });

      await sleep(10 * 1000);

      await agent.aiAssert('this is a login page');

      await agent.ai(
        'type "standard_user" in user name input, type "secret_sauce" in password',
      );

      await agent.aiTap('Login', {
        // deepThink: true,
      });

      // Legacy scroll param compatibility: ensure old scrollType values still work
      await agent.aiScroll('', {
        direction: 'down',
        scrollType: 'once',
      } as any);
      await agent.aiScroll('', {
        direction: 'up',
        scrollType: 'once',
      } as any);

      expect(beforeInvokeAction.mock.calls.length).toBeGreaterThan(1);
      expect(beforeInvokeAction.mock.calls.length).toEqual(
        afterInvokeAction.mock.calls.length,
      );
      expect(beforeInvokeAction.mock.calls.length).toBeGreaterThan(2);

      expect(onTaskStartTip.mock.calls.length).toBeGreaterThan(1);

      await expect(async () => {
        await agent.aiWaitFor('there is a cookie prompt in the UI', {
          timeoutMs: 10 * 1000,
        });
      }).rejects.toThrowError();

      // find the items
      const items = await agent.aiQuery(
        '{name: string, price: number, actionBtnName: string, imageUrl: string}[], return item name, price and the action button name on the lower right corner of each item, and the image url of each item (like "Remove")',
        { domIncluded: true, screenshotIncluded: false },
      );
      console.log('item list', items);
      expect(items[0].imageUrl).toContain('/static/media/');
      expect(items.length).toBeGreaterThanOrEqual(2);

      await agent.aiAssert('The price of "Sauce Labs Backpack" is 29.99');
    });

    it('extract the Github service status', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.githubstatus.com/',
      );
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      const result = await agent.aiQuery(
        'this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}',
      );
      console.log('Github service status', result);

      expect(async () => {
        // there is no food delivery service on Github
        await agent.aiAssert(
          'there is a "food delivery" service on page and is in normal state',
        );
      });
    });

    it.skipIf(process.env.CI)('find widgets in antd', async () => {
      const { originPage, reset } = await launchPage(
        'https://ant.design/components/form/', // will be banned by the website on CI
      );
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      // await agent.aiAct('If pop-ups are displayed click seven days out alert');
      await sleep(8000);
      await agent.aiAct(
        'Click the password input in the demo section on page, type "abc"',
      );

      await agent.aiAct(
        'click the "icon" on the categories on the left, sleep 5s, in the newly loaded page, type "pause" in the icon search box(it shows "search icon here")',
      );

      const names = await agent.aiQuery<string[]>(
        'find all component names in the page, return in string[]',
      );

      expect(names.length).toBeGreaterThan(5);
    });

    const vlMode = globalModelConfigManager.getModelConfig('default').vlMode;

    it.skipIf(!vlMode)('search engine with specific actions', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      await agent.aiInput('the search bar input', {
        value: 'AI 101',
      });
      await agent.aiTap('the search button');

      await sleep(3000);

      await agent.aiScroll('', {
        direction: 'down',
        scrollType: 'scrollToBottom',
      });

      await sleep(3000);

      const settingsButton = await agent.aiBoolean(
        'there is a settings button in the page',
      );

      if (settingsButton) {
        await agent.aiTap('the settings button', {
          deepThink: true,
        });

        await agent.aiTap('搜索设置', {
          deepThink: true,
        });

        await agent.aiTap('the close button of the popup', {
          deepThink: true,
        });

        await agent.aiAssert('there is NOT a popup shown in the page');
      }
    });

    it(
      'search engine',
      async () => {
        const { originPage, reset } = await launchPage('https://www.bing.com/');
        resetFn = reset;
        agent = new PuppeteerAgent(originPage);
        await agent.aiAct('type "AI 101" in search box');
        await agent.aiAct(
          'type "Hello world" in search box, hit Enter, wait 2s',
        );

        await agent.aiWaitFor(
          'there are some search results about "Hello world"',
        );
      },
      3 * 60 * 1000,
    );

    it('element describer', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      const { center } = await agent.aiLocate('the input field for search');
      const describeResult = await agent.describeElementAtPoint(center);
      expect(describeResult.verifyResult?.pass).toBe(true);
      expect(describeResult.verifyResult?.rect).toBeTruthy();
      expect(describeResult.verifyResult?.center).toBeTruthy();
    });

    it('element describer - deep think', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      const { center } = await agent.aiLocate('the input field for search');
      const describeResult = await agent.describeElementAtPoint(center, {
        deepThink: true,
        centerDistanceThreshold: 50,
      });
      // console.log('describeResult', describeResult);
      expect(describeResult.verifyResult?.pass).toBe(true);
      expect(describeResult.verifyResult?.rect).toBeTruthy();
      expect(describeResult.verifyResult?.center).toBeTruthy();
    });

    it('scroll', async () => {
      const htmlPath = path.join(__dirname, 'scroll.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);
      await agent.aiAct(
        'find the "Vertical 2" element, scroll down 200px, find the "Horizontal 2" element, scroll right 100px',
      );
      await agent.aiAssert(
        'the "Horizontal 2", "Horizontal 4" and "Vertical 5" elements are visible',
      );
    });

    it('native <select /> element', async () => {
      const htmlPath = path.join(__dirname, 'select.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage, {
        forceChromeSelectRendering: true,
      });
      await agent.aiAct(
        'select the "fruit" element, select the "apple" option, sleep 2s, refresh, select the same option again. Assert: the "Current selection: Apple" text is visible. If you find it failed to select after several attempts, do not retry, it is an fatal error',
      );
    });

    it('append custom action - UploadFile is invoked', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;

      const uploadCalled = vi.fn();
      const UploadFile = defineAction({
        name: 'UploadFile',
        description: 'Upload a local file to current page',
        paramSchema: z.object({
          filePath: z.string().describe('Absolute or relative local file path'),
        }),
        call: async (param) => {
          uploadCalled(param.filePath);
        },
      });

      agent = new PuppeteerAgent(originPage, {
        customActions: [UploadFile],
      });

      await agent.aiAct(
        'Upload a local file to current page, which path is /tmp/demo.txt',
      );

      expect(uploadCalled).toHaveBeenCalledTimes(1);
      expect(uploadCalled).toHaveBeenCalledWith('/tmp/demo.txt');
    });

    it('not tracking active tab', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: false,
      });
      await agent.aiAct('Tap hao123 in the navigation bar');
      await sleep(6000);

      await expect(async () => {
        await agent.aiAssert('There is a weather forecast in the page');
      }).rejects.toThrowError();
    });

    it('tracking active tab', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: true,
      });
      await agent.aiAct('Tap hao123 in the navigation bar');

      await agent.aiWaitFor('There is a weather forecast in the page');
    });

    it('input xss content', async () => {
      const { originPage, reset } = await launchPage('https://www.google.com/');
      agent = new PuppeteerAgent(originPage);
      await agent.aiInput(
        '<html>hello world</html><script>alert("xss")</script><button>click me</button>',
        'the search box',
      );
      await reset();

      const reportFile = agent.reportFile;
      const reportPage = await launchPage(`file://${reportFile}`);
      const reportAgent = new PuppeteerAgent(reportPage.originPage);
      await reportAgent.aiAssert('there is a sidebar in the page');
      resetFn = reportPage.reset;
    });

    it('Sauce Demo by Swag Lab - aiQuery', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      resetFn = reset;
      agent = new PuppeteerAgent(originPage, {
        cacheId: 'puppeteer(Sauce Demo by Swag Lab)',
      });

      await sleep(10 * 1000);

      const title = await agent.aiQuery('the page title, string');
      const list = await agent.aiQuery('the name of input fields, string[]');
      const button = await agent.aiQuery({
        first_input_name: 'the name of the first input field, string',
        login_button_name: 'the name of the login button, string',
      });
      expect(title).toBe('Swag Labs');
      expect(list.length).toBeGreaterThan(0);
      expect(button.first_input_name).toBeDefined();
    });

    it.skip('Playground', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);
      // await agent.aiAct('Close the cookie prompt');
      await agent.aiAct(
        'Type "AI 101" in search box, hit Enter, wait 2s. If there is a cookie prompt, close it',
      );
    });

    it('swipe', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`, {
        viewport: {
          width: 393,
          height: 808,
        },
      });
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      // Verify initial state
      await agent.aiAssert(
        'The swipe container shows "Panel 1 - Swipe to see more"',
      );

      const screenshot1 = await agent.page.screenshotBase64();
      await sleep(2000);
      await agent.aiAct('Swipe from right to left on the swipe container');

      // Verify content changed after swipe
      await agent.aiAssert(
        'The swipe container shows "Panel 2 - Keep swiping"',
      );
      await agent.aiAssert({
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
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`, {
        viewport: {
          width: 393,
          height: 808,
        },
      });
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      // Try multiple approaches to trigger the context menu
      await agent.aiAct('Press and hold the search button for 1 second');
      await sleep(1000);

      await agent.aiAssert('A context menu is visible on the page');
      await agent.aiAssert(
        'The context menu contains "Copy", "Paste", and "Delete" options',
      );
    });

    it('double click', async () => {
      const { originPage, reset } = await launchPage(
        'https://cpstest.us/double-click-test/',
      );
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);
      await agent.aiAct('double click the "Click Me" button');

      await agent.aiAssert(
        'the "Double" field in the "Left" section shows Double:1 instead of Double:0',
      );
    });

    it('xpath', async () => {
      const htmlPath = path.join(__dirname, 'local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      const element = await agent.aiLocate('the "Search" button');
      const { rect } = element;

      const feature = await agent.interface.cacheFeatureForRect(rect);
      expect(feature).toBeTruthy();

      const rectFromXpath =
        await agent.interface.rectMatchesCacheFeature(feature);
      expect(rectFromXpath).toBeTruthy();

      expect(Math.abs(rectFromXpath.left - rect.left)).toBeLessThan(50);
      expect(Math.abs(rectFromXpath.top - rect.top)).toBeLessThan(50);
    });
  },
  4 * 60 * 1000,
);
