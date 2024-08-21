import { PuppeteerAgent } from '@/puppeteer';
import { describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 180 * 1000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('puppeteer integration', () => {
  it.only('抖音来客', async () => {
    const page = await launchPage('https://life-boe.bytedance.net/p/login', {
      headless: false,
    });
    const mid = new PuppeteerAgent(page);

    await mid.aiWaitFor('界面右侧有一个“手机号”输入框');
    await sleep(500 * 1000);
    await mid.ai(`
        1、找到手机号码输入框，输入 12342512971
        2、找到验证码输入框，输入 3518
        3、找到“已阅读并同意”文本左边的 checkbox，执行点击操作
        4、找到立即入驻按钮，执行点击操作
      `);

    await mid.aiWaitFor('界面上有一个“订单管理”按钮');
  });

  it('Sauce Demo by Swag Lab', async () => {
    const page = await launchPage('https://www.saucedemo.com/');
    const mid = new PuppeteerAgent(page);

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
  });

  it('extract the Github service status', async () => {
    const page = await launchPage('https://www.githubstatus.com/');
    const mid = new PuppeteerAgent(page);

    const result = await mid.aiQuery(
      'this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}',
    );
    console.log('Github service status', result);

    expect(async () => {
      // there is no food delivery service on Github
      await mid.aiAssert(
        'there is a "food delivery" service on page and is in normal state',
      );

      await sleep(2000);

      // find the items
      const items = await mid.aiQuery(
        '"{name: string, price: number, actionBtnName: string}[], return item name, price and the action button name on the lower right corner of each item (like "Remove")',
      );
      console.log('item list', items);
      expect(items.length).toBeGreaterThanOrEqual(2);

      await mid.aiAssert('The price of "Sauce Labs Onesie" is 7.99');
    });
  });

  it('extract the Github service status', async () => {
    const page = await launchPage('https://www.githubstatus.com/');
    const mid = new PuppeteerAgent(page);

    const result = await mid.aiQuery(
      'this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}',
    );
    console.log('Github service status', result);

    // obviously there is no food delivery service on Github
    expect(async () => {
      await mid.aiAssert(
        'there is a "food delivery" service on page and is in normal state',
      );
    }).rejects.toThrowError();
  });
});
