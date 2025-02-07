import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

describe(
  'puppeteer integration',
  () => {
    let resetFn: () => Promise<void>;
    afterEach(async () => {
      if (resetFn) {
        await resetFn();
      }
    });

    it('Sauce Demo by Swag Lab', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      resetFn = reset;
      const onTaskStartTip = vi.fn();
      const mid = new PuppeteerAgent(originPage, {
        cacheId: 'puppeteer(Sauce Demo by Swag Lab)',
        onTaskStartTip,
      });

      await mid.aiAction(
        'type "standard_user" in user name input, type "secret_sauce" in password, click "Login", sleep 1s',
      );

      expect(onTaskStartTip.mock.calls.length).toBeGreaterThan(1);

      await expect(async () => {
        await mid.aiWaitFor('there is a cookie prompt in the UI', {
          timeoutMs: 10 * 1000,
        });
      }).rejects.toThrowError();

      // find the items
      const items = await mid.aiQuery(
        '"{name: string, price: number, actionBtnName: string}[], return item name, price and the action button name on the lower right corner of each item (like "Remove")',
      );
      console.log('item list', items);
      expect(items.length).toBeGreaterThanOrEqual(2);

      await mid.aiAssert('The price of "Sauce Labs Onesie" is 7.99');
    });

    it('extract the Github service status', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.githubstatus.com/',
      );
      resetFn = reset;
      const mid = new PuppeteerAgent(originPage);

      const result = await mid.aiQuery(
        'this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}',
      );
      console.log('Github service status', result);

      expect(async () => {
        // there is no food delivery service on Github
        await mid.aiAssert(
          'there is a "food delivery" service on page and is in normal state',
        );
      });
    });

    it.skipIf(process.env.CI)('find widgets in antd', async () => {
      const { originPage, reset } = await launchPage(
        'https://ant.design/components/form/', // will be banned by the website on CI
      );
      resetFn = reset;
      const mid = new PuppeteerAgent(originPage);

      // await mid.aiAction('If pop-ups are displayed click seven days out alert');
      await sleep(8000);
      await mid.aiAction(
        'Click the password input in the demo section on page, type "abc"',
      );

      await mid.aiAction(
        'click the "icon" on the categories on the left, sleep 5s, in the newly loaded page, type "pause" in the icon search box(it shows "search icon here")',
      );

      const names = await mid.aiQuery(
        'find all component names in the page, return in string[]',
      );

      expect(names.length).toBeGreaterThan(5);
    });

    it(
      'search engine',
      async () => {
        const { originPage, reset } = await launchPage(
          'https://www.baidu.com/',
        );
        resetFn = reset;
        const mid = new PuppeteerAgent(originPage);
        await mid.aiAction('type "AI 101" in search box');
        await mid.aiAction(
          'type "Hello world" in search box, hit Enter, wait 2s, click the second result, wait 4s',
        );

        await mid.aiWaitFor(
          'there are some search results about "Hello world"',
        );
      },
      {
        timeout: 3 * 60 * 1000,
      },
    );

    it('scroll', async () => {
      const htmlPath = path.join(__dirname, 'scroll.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      resetFn = reset;
      const mid = new PuppeteerAgent(originPage);
      await mid.aiAction(
        'find the "Vertical 2" element, scroll down 200px, find the "Horizontal 2" element, scroll right 100px',
      );
      await mid.aiAssert(
        'the "Horizontal 2", "Horizontal 4" and "Vertical 5" elements are visible',
      );
    });

    it('not tracking active tab', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const mid = new PuppeteerAgent(originPage, {
        trackingActiveTab: false,
      });
      await mid.aiAction('Tap hao123 in the navigation bar');
      await sleep(6000);

      expect(async () => {
        await mid.aiAssert('There is a weather forecast in the page');
      }).rejects.toThrowError();
    });

    it('tracking active tab', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const mid = new PuppeteerAgent(originPage, {
        trackingActiveTab: true,
      });
      await mid.aiAction('Tap hao123 in the navigation bar');

      await mid.aiWaitFor('There is a weather forecast in the page');
    });

    it.skip('Playground', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      resetFn = reset;
      const mid = new PuppeteerAgent(originPage);
      // await mid.aiAction('Close the cookie prompt');
      await mid.aiAction(
        'Type "AI 101" in search box, hit Enter, wait 2s. If there is a cookie prompt, close it',
      );
    });
  },
  {
    timeout: 4 * 60 * 1000,
  },
);
