import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEST_TIMEOUT, createTestContext } from './test-utils';
import { launchPage } from './utils';

describe(
  'Sauce Demo Tests',
  () => {
    const ctx = createTestContext();

    it('Sauce Demo by Swag Lab', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
        {
          headless: false,
        },
      );
      ctx.resetFn = reset;
      const onTaskStartTip = vi.fn();
      const beforeInvokeAction = vi.fn();
      const afterInvokeAction = vi.fn();
      ctx.agent = new PuppeteerAgent(originPage, {
        cacheId: 'puppeteer(Sauce Demo by Swag Lab)',
        onTaskStartTip,
        beforeInvokeAction,
        afterInvokeAction,
      });

      await ctx.agent.aiAssert('this is a login page');

      const pw = await ctx.agent.aiAct(
        'do nothing and tell me the what the password is',
      );
      expect(pw).toBe('secret_sauce');

      await ctx.agent.ai('login with "standard_user" and "secret_sauce"');

      // Wait for products page to load after login
      await ctx.agent.aiWaitFor('there are products displayed on the page', {
        checkIntervalMs: 5000,
      });

      const price = await ctx.agent.ai(
        'Add first two items to the cart and tell me the total price of the cart. Just the price number, no other text',
      );
      console.log('price', price);
      expect(price).toBeDefined();

      // Legacy scroll param compatibility: ensure old scrollType values still work
      await ctx.agent.aiScroll('', {
        direction: 'down',
        scrollType: 'once',
      } as any);
      await ctx.agent.aiScroll('', {
        direction: 'up',
        scrollType: 'once',
      } as any);

      expect(beforeInvokeAction.mock.calls.length).toBeGreaterThan(1);
      expect(beforeInvokeAction.mock.calls.length).toEqual(
        afterInvokeAction.mock.calls.length,
      );
      expect(beforeInvokeAction.mock.calls.length).toBeGreaterThan(2);

      expect(onTaskStartTip.mock.calls.length).toBeGreaterThan(1);

      // Test that aiWaitFor correctly times out for non-existent elements
      await expect(async () => {
        await ctx.agent!.aiWaitFor(
          'there is a non-existent element XYZ123 in the UI',
          {
            timeoutMs: 10 * 1000,
          },
        );
      }).rejects.toThrowError();

      // find the items
      const items = await ctx.agent.aiQuery(
        '{name: string, price: number, actionBtnName: string, imageUrl: string}[], return item name, price and the action button name on the lower right corner of each item, and the image url of each item (like "Remove")',
        { domIncluded: true, screenshotIncluded: false },
      );
      console.log('item list', items);
      expect(items[0].imageUrl).toContain('/static/media/');
      expect(items.length).toBeGreaterThanOrEqual(2);

      await ctx.agent.aiAssert('The price of "Sauce Labs Backpack" is 29.99');
    });

    it('Sauce Demo by Swag Lab - aiQuery', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
      );
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        cacheId: 'puppeteer(Sauce Demo by Swag Lab)',
      });

      await sleep(10 * 1000);

      const title = await ctx.agent.aiQuery('the page title, string');
      const list = await ctx.agent.aiQuery(
        'the name of input fields, string[]',
      );
      const button = await ctx.agent.aiQuery({
        first_input_name: 'the name of the first input field, string',
        login_button_name: 'the name of the login button, string',
      });
      expect(title).toBe('Swag Labs');
      expect(list.length).toBeGreaterThan(0);
      expect(button.first_input_name).toBeDefined();
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
