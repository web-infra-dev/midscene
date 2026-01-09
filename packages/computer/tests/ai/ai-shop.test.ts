import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { openBrowserAndNavigate } from './test-utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const isCacheEnabled = process.env.MIDSCENE_CACHE;

describe('computer shop app automation', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'You are testing a web application on a desktop browser.',
    });
  });

  it(
    'should automate shop login and cart operations',
    async () => {
      if (isCacheEnabled) {
        vi.setConfig({ testTimeout: 1000 * 1000 });
      }

      await openBrowserAndNavigate(agent, 'https://www.saucedemo.com/');

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
