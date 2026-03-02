import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { HarmonyAgent, HarmonyDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

const pageUrl = 'https://www.ebay.com';

describe('Test eBay search', () => {
  let agent: HarmonyAgent;

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    const page = new HarmonyDevice(devices[0].deviceId);
    agent = new HarmonyAgent(page, {
      aiActionContext:
        'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
    });
    await page.connect();

    // Go to home screen, find and open the browser, then navigate to URL
    await page.home();
    await sleep(1000);
    await agent.aiAct('click the browser icon (浏览器) on the screen');
    await sleep(2000);
    await agent.aiAct(
      `click the search/URL bar, type "${pageUrl}" and press Enter to navigate`,
    );
    await sleep(5000);
  });

  it(
    'search headphones',
    async () => {
      // 👀 type keywords, perform a search
      await agent.aiAct('type "Headphones" in search box, click search button');

      // 👀 wait for the loading
      await agent.aiWaitFor('there is at least one headphone item on page');

      // 👀 understand the page content, find the items
      const items = await agent.aiQuery(
        '{itemTitle: string, price: Number}[], find item in list and corresponding price',
      );
      console.log('headphones in stock', items);

      // 👀 assert by AI
      await agent.aiAssert('There is a category filter on the left');
    },
    720 * 1000,
  );
});
