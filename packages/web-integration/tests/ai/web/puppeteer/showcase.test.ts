import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { vlLocateMode } from '@midscene/shared/env';
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

    it.only('Sauce Demo by Swag Lab', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      resetFn = reset;
      const onTaskStartTip = vi.fn();
      const agent = new PuppeteerAgent(originPage, {
        cacheId: 'puppeteer(Sauce Demo by Swag Lab)',
        onTaskStartTip,
      });

      await sleep(10 * 1000);

      // const flag = await agent.aiBoolean('this is a login page');
      // expect(flag).toBe(true);

      await agent.aiAction(
        'type "standard_user" in user name input, type "secret_sauce" in password, type Login',
      );

      await agent.aiTap('the first "Add to cart" button');

      // expect(onTaskStartTip.mock.calls.length).toBeGreaterThan(1);

      // await expect(async () => {
      //   await agent.aiWaitFor('there is a cookie prompt in the UI', {
      //     timeoutMs: 10 * 1000,
      //   });
      // }).rejects.toThrowError();

      // // find the items
      // const items = await agent.aiQuery(
      //   '"{name: string, price: number, actionBtnName: string}[], return item name, price and the action button name on the lower right corner of each item (like "Remove")',
      // );
      // console.log('item list', items);
      // expect(items.length).toBeGreaterThanOrEqual(2);

      // await agent.aiAssert('The price of "Sauce Labs Backpack" is 29.99');
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

      const names = await agent.aiQuery(
        'find all component names in the page, return in string[]',
      );

      expect(names.length).toBeGreaterThan(5);
    });

    it.skipIf(!vlLocateMode())(
      'search engine with specific actions',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://www.baidu.com/',
        );
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
      },
    );

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

    it('not tracking active tab', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: false,
      });
      await agent.aiAction('Tap hao123 in the navigation bar');
      await sleep(6000);

      expect(async () => {
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

    it.skip('Playground', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const agent = new PuppeteerAgent(originPage);
      // await agent.aiAction('Close the cookie prompt');
      await agent.aiAction(
        'Type "AI 101" in search box, hit Enter, wait 2s. If there is a cookie prompt, close it',
      );
    });
  },
  4 * 60 * 1000,
);
