import { PuppeteerAgent } from '@/puppeteer';
import { describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

describe(
  'puppeteer integration',
  () => {
    it('Sauce Demo by Swag Lab', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      const mid = new PuppeteerAgent(originPage);
      await mid.aiAction(
        'type "standard_user" in user name input, type "secret_sauce" in password, click "Login"',
      );

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
      await reset();
    });

    it('extract the Github service status', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.githubstatus.com/',
      );
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

      await reset();
    });

    it('find widgets in antd', async () => {
      const { originPage, reset } = await launchPage(
        'https://ant.design/components/form-cn/',
      );
      const mid = new PuppeteerAgent(originPage);

      await mid.aiAction('scroll down two screen');

      const widgets = await mid.aiQuery(
        'find all inputs in the page, return the field name in string[]',
      );

      await reset();
    });

    it('Search', async () => {
      const { originPage, reset } = await launchPage('https://www.baidu.com/');
      const mid = new PuppeteerAgent(originPage);
      await mid.aiAction(
        'type "Weather in Shanghai" in search box, hit Enter, wait 2s, click the "Image" button below the search box`',
      );

      await mid.aiWaitFor('there is weather info in Shanghai');

      await reset();
    });
  },
  {
    timeout: 180 * 1000,
  },
);
