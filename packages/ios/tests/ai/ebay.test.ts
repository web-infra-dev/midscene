import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import {
  agentFromIOSDevice,
  checkIOSEnvironment,
  getConnectedDevices,
} from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
  hookTimeout: 240 * 1000, // Add hook timeout for beforeAll
});

describe('Test eBay search', () => {
  let agent: any;

  beforeAll(async () => {
    try {
      // Check if iOS environment is available before running tests
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        console.warn(`iOS environment check failed: ${envCheck.error}`);
        // Skip test if environment is not available
        return;
      }

      const devices = await getConnectedDevices();
      if (devices.length === 0) {
        console.warn('No iOS devices available, skipping test');
        return;
      }

      agent = await agentFromIOSDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, cookies popup, click agree or allow. If login page pops up, close it.',
      });
      await agent.launch('https://www.ebay.com');
      await sleep(5000); // Wait for page to load
    } catch (error) {
      console.warn(`Setup failed, skipping test: ${error}`);
      // Skip test if setup fails
    }
  }, 240 * 1000); // Explicit timeout for beforeAll

  it(
    'search headphones',
    async () => {
      if (!agent) {
        console.warn('Agent not initialized, skipping test');
        return;
      }

      // 👀 type keywords, perform a search
      await agent.aiAction(
        'type "Headphones" in search box, tap search button',
      );

      // 👀 wait for the loading
      await agent.aiWaitFor('there is at least one headphone item on page');
      // or you may use a plain sleep:
      // await sleep(5000);

      // 👀 understand the page content, find the items
      const items = await agent.aiQuery(
        '{itemTitle: string, price: Number}[], find item in list and corresponding price',
      );
      console.log('headphones in stock', items);

      // 👀 assert by AI
      await agent.aiAssert(
        'There is a search filter or category section visible',
      );
    },
    720 * 1000,
  );
});
