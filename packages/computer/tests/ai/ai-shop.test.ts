import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { type ComputerAgent, agentFromDesktop } from '../../src';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

describe('computer shop app automation', () => {
  let agent: ComputerAgent;
  const isMac = process.platform === 'darwin';

  beforeAll(async () => {
    agent = await agentFromDesktop({
      aiActionContext:
        'You are testing a web application on a desktop browser.',
    });
  });

  it(
    'should automate shop login and cart operations',
    async () => {
      if (CACHE_TIME_OUT) {
        vi.setConfig({ testTimeout: 1000 * 1000 });
      }

      // Open browser and navigate to shop app
      if (isMac) {
        await agent.aiAct('press Cmd+Space');
        await sleep(500);
        await agent.aiAct('type "Safari" and press Enter');
        await sleep(2000);
        await agent.aiAct('press Cmd+L to focus address bar');
        await sleep(300);
      } else {
        await agent.aiAct('press Windows key');
        await sleep(500);
        await agent.aiAct('type "Chrome" and press Enter');
        await sleep(2000);
        await agent.aiAct('press Ctrl+L to focus address bar');
        await sleep(300);
      }

      await agent.aiAct('type "https://www.saucedemo.com/"');
      await agent.aiAct('press Enter');
      await sleep(3000);

      // Wait for page to load
      await agent.aiAssert('The login form is visible');

      // Login
      await agent.aiAct('type "standard_user" in user name input');
      await agent.aiAct('type "secret_sauce" in password input');
      await agent.aiAct('click Login Button');
      await sleep(2000);

      // Check the login success
      await agent.aiAssert('the page title is "Swag Labs"');

      // Add to cart
      await agent.aiAct('click "add to cart" for black t-shirt products');
      await sleep(500);

      // Click cart icon
      await agent.aiAct('click right top cart icon');
      await sleep(1000);

      // Verify cart page loaded
      await agent.aiAssert('The cart page is displayed');
    },
    360 * 1000,
  );
});
