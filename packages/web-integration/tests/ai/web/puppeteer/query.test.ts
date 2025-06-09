import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

describe(
  'puppeteer integration - query',
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
      const agent = new PuppeteerAgent(originPage);

      await agent.aiAction(
        'type "standard_user" in user name input, type "secret_sauce" in password, click login',
      );

      // find the items
      const items = await agent.aiQuery(
        '{name: string, price: number, actionBtnName: string, imageUrl: string}[], return item name, price and the action button name on the lower right corner of each item, and the image url of each item (like "Remove")',
        { domIncluded: true, screenshotIncluded: false },
      );

      expect(items.length).toBeGreaterThan(4); // only 1 items show in the viewport, but we should get more from the DOM
    });
  },
  4 * 60 * 1000,
);
