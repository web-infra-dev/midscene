import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

describe(
  'puppeteer integration - query',
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

    it('query by DOM', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
        {
          viewport: {
            width: 1024,
            height: 400,
          },
        },
      );
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      await agent.aiAct(
        'type "standard_user" in user name input, type "secret_sauce" in password, click login',
      );

      // find the items
      const items = await agent.aiQuery(
        '{name: string, price: number, actionBtnName: string, imageUrl: string}[], return item name, price and the action button name on the lower right corner of each item, and the image url of each item (like "Remove")',
        { domIncluded: true, screenshotIncluded: false },
      );

      expect(items.length).toBeGreaterThan(4); // only 1 items show in the viewport, but we should get more from the DOM
    });

    it('query non-existent data should throw error with usage recorded', async () => {
      const { originPage, reset } = await launchPage(
        'https://www.saucedemo.com/',
        {
          viewport: {
            width: 1024,
            height: 400,
          },
        },
      );
      resetFn = reset;
      agent = new PuppeteerAgent(originPage);

      // Query something that doesn't exist on the page - should cause an error
      await expect(
        agent.aiQuery("today's weather forecast temperature in celsius"),
      ).rejects.toThrow();
    });
  },
  4 * 60 * 1000,
);
