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
    afterEach(async () => {
      if (resetFn) {
        try {
          await resetFn();
        } catch (e) {
          console.warn('resetFn error');
          console.warn(e);
        }
      }
    });

    it('error in beforeInvokeAction', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage, {
        beforeInvokeAction: () => {
          throw new Error('this is an error in beforeInvokeAction');
        },
      });

      await expect(async () => {
        await agent.aiAction(
          'type "standard_user" in user name input, type "secret_sauce" in password',
        );
      }).rejects.toThrowError();
    });

    it('Sauce Demo by Swag Lab', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      resetFn = reset;
      const onTaskStartTip = vi.fn();
      const beforeInvokeAction = vi.fn();
      const afterInvokeAction = vi.fn();
      const agent = new PuppeteerAgent(originPage, {
        cacheId: 'puppeteer(Sauce Demo by Swag Lab)',
        onTaskStartTip,
        beforeInvokeAction,
        afterInvokeAction,
      });

      await sleep(10 * 1000);

      const flag = await agent.aiBoolean('this is a login page');
      expect(flag).toBe(true);

      await agent.aiAction(
        'type "standard_user" in user name input, type "secret_sauce" in password',
      );

      await agent.aiTap('Login');

      expect(beforeInvokeAction.mock.calls.length).toBeGreaterThan(1);
      expect(beforeInvokeAction.mock.calls.length).toEqual(
        afterInvokeAction.mock.calls.length,
      );
      expect(
        beforeInvokeAction.mock.calls.map((call) => call[0]),
      ).toMatchInlineSnapshot(`
        [
          "Input",
          "Input",
          "Tap",
        ]
      `);

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
      const agent = new PuppeteerAgent(originPage);

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
      const agent = new PuppeteerAgent(originPage);

      // await agent.aiAction('If pop-ups are displayed click seven days out alert');
      await sleep(8000);
      await agent.aiAction(
        'Click the password input in the demo section on page, type "abc"',
      );

      await agent.aiAction(
        'click the "icon" on the categories on the left, sleep 5s, in the newly loaded page, type "pause" in the icon search box(it shows "search icon here")',
      );

      const names = await agent.aiQuery<string[]>(
        'find all component names in the page, return in string[]',
      );

      expect(names.length).toBeGreaterThan(5);
    });

    const vlMode = globalModelConfigManager.getModelConfig('default').vlMode;

    it.skipIf(!vlMode)('search engine with specific actions', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);

      await agent.aiInput('AI 101', 'the search bar input');
      await agent.aiTap('the search button');

      await sleep(3000);

      await agent.aiScroll({
        direction: 'down',
        scrollType: 'untilBottom',
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
        const agent = new PuppeteerAgent(originPage);
        await agent.aiAction('type "AI 101" in search box');
        await agent.aiAction(
          'type "Hello world" in search box, hit Enter, wait 2s',
        );

        await agent.aiWaitFor(
          'there are some search results about "Hello world"',
        );
      },
      3 * 60 * 1000,
    );

    it.only(
      'search engine',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://news.baidu.com/',
        );
        resetFn = reset;
        const agent = new PuppeteerAgent(originPage, { cacheId: 'news' });
        await agent.runYaml(
          `
          tasks:
            - name: scroll down 100px
              flow:
                - aiScroll: 第一条新闻标题
                  direction: down
                  scrollType: once
                  cacheable: false
        `,
        );
      },
      3 * 60 * 1000,
    );

    it('element describer', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);

      const { center } = await agent.aiLocate('the input field for search');
      const describeResult = await agent.describeElementAtPoint(center);
      expect(describeResult.verifyResult?.pass).toBe(true);
      expect(describeResult.verifyResult?.rect).toBeTruthy();
      expect(describeResult.verifyResult?.center).toBeTruthy();
    });

    it('element describer - deep think', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);

      const { center } = await agent.aiLocate('the input field for search');
      const describeResult = await agent.describeElementAtPoint(center, {
        deepThink: true,
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
      const agent = new PuppeteerAgent(originPage);
      await agent.aiAction(
        'find the "Vertical 2" element, scroll down 200px, find the "Horizontal 2" element, scroll right 100px',
      );
      await agent.aiAssert(
        'the "Horizontal 2", "Horizontal 4" and "Vertical 5" elements are visible',
      );
    });

    it('append custom action - UploadFile is invoked', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
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

      const agent = new PuppeteerAgent(originPage, {
        customActions: [UploadFile],
      });

      await agent.aiAction(
        'Upload a local file to current page, which path is /tmp/demo.txt',
      );

      expect(uploadCalled).toHaveBeenCalledTimes(1);
      expect(uploadCalled).toHaveBeenCalledWith('/tmp/demo.txt');
    });

    it('not tracking active tab', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: false,
      });
      await agent.aiAction('Tap hao123 in the navigation bar');
      await sleep(6000);

      await expect(async () => {
        await agent.aiAssert('There is a weather forecast in the page');
      }).rejects.toThrowError();
    });

    it('tracking active tab', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: true,
      });
      await agent.aiAction('Tap hao123 in the navigation bar');

      await agent.aiWaitFor('There is a weather forecast in the page');
    });

    it('input xss content', async () => {
      const { originPage, reset } = await launchPage('https://www.google.com/');
      const agent = new PuppeteerAgent(originPage);
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
      const agent = new PuppeteerAgent(originPage, {
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
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);
      // await agent.aiAction('Close the cookie prompt');
      await agent.aiAction(
        'Type "AI 101" in search box, hit Enter, wait 2s. If there is a cookie prompt, close it',
      );
    });

    it('swipe', async () => {
      const { originPage, reset } = await launchPage(
        'https://m.baidu.com/s?word=%E5%A4%A7%E4%BC%97%E8%BD%A6%E5%9E%8Bid4',
        {
          viewport: {
            width: 393,
            height: 808,
          },
        },
      );
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);
      const screenshot1 = await agent.page.screenshotBase64();
      await sleep(2000);
      await agent.aiAction('Swipe right one screen');

      await agent.aiAssert({
        prompt: 'The content of the page is different from the reference',
        images: [
          {
            name: 'reference screenshot',
            url: screenshot1,
          },
        ],
      });

      const screenshot2 = await agent.page.screenshotBase64();
      await agent.aiAction('Swipe left one screen');
      await sleep(2000);
      await agent.aiAssert({
        prompt: 'The content of the page is different from the reference',
        images: [
          {
            name: 'reference screenshot',
            url: screenshot2,
          },
        ],
      });
    });

    it('longPress', async () => {
      const { originPage, reset } = await launchPage(
        'https://m.baidu.com/from=0/ssid=0/s?word=%E5%A6%82%E6%9D%A5%E7%A5%9E%E6%B6%A8&sa=tb&ts=0&t_kt=0&ie=utf-8&rsv_t=62bcq4PxoQqNwE8k4KOIBgUFF1bZTuF4rSCYiho4tfMUcLopBczbgw&rsv_pq=11619249566711746686&ss=110&sugid=206020460001898&rfrom=1024439f&rchannel=1024439j&rqid=11619249566711746686',
        {
          viewport: {
            width: 393,
            height: 808,
          },
        },
      );
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);
      await agent.aiAction('长按进入新空间按钮');
    });

    it('double click', async () => {
      const { originPage, reset } = await launchPage(
        'https://cpstest.us/double-click-test/',
      );
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);
      await agent.aiAction('double click the "Click Me" button');

      await agent.aiAssert(
        'the "Double" field in the "Left" section shows Double:1 instead of Double:0',
      );
    });
  },
  4 * 60 * 1000,
);
