import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { openBrowserAndNavigate } from './test-utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const isCacheEnabled = process.env.MIDSCENE_CACHE;

describe('computer weather query automation', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'If any popup appears, click agree. If login page appears, skip it.',
    });
  });

  it(
    'should query San Jose tomorrow weather temperature on Google',
    async () => {
      if (isCacheEnabled) {
        vi.setConfig({ testTimeout: 1000 * 1000 });
      }

      await openBrowserAndNavigate(agent, 'https://www.google.com');

      // Wait for page to load
      await agent.aiWaitFor('The Google search box is visible');

      // Search for San Jose tomorrow weather
      await agent.aiAct(
        'Enter "San Jose tomorrow weather temperature" in the search box',
      );
      await agent.aiAct('Press Enter to search');

      // Wait for search results
      await agent.aiWaitFor('Weather information is displayed on the page', {
        timeoutMs: 10000,
      });

      // Query the temperature
      const temperature = await agent.aiQuery<string>(
        'string, the temperature value shown in the weather widget (e.g. "15°C" or "59°F")',
      );
      console.log('Tomorrow temperature in San Jose:', temperature);

      // Verify we got a temperature value
      expect(temperature).toBeTruthy();
      expect(temperature).toMatch(/\d+°[CF]/);
    },
    360 * 1000,
  );
});
