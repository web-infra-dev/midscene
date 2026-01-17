import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

describe('computer web browser automation', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    const device = new ComputerDevice({});
    agent = new ComputerAgent(device, {
      aiActionContext:
        'You are automating a web browser on a desktop computer. If any popup appears, close it.',
    });
    await device.connect();
  });

  it(
    'open browser and navigate',
    async () => {
      const isMac = process.platform === 'darwin';

      // Open browser (using platform-specific shortcuts)
      if (isMac) {
        await agent.aiAct('press Cmd+Space to open Spotlight');
        await sleep(1000);
        await agent.aiAct('type "Safari" and press Enter');
      } else {
        await agent.aiAct('press Windows key');
        await sleep(1000);
        await agent.aiAct('type "Chrome" and press Enter');
      }

      await sleep(3000);

      // Wait for browser to open
      await agent.aiWaitFor('Browser window is open');

      // Navigate to website
      await agent.aiAct('click on address bar and type "example.com"');
      await sleep(1000);
      await agent.aiAct('press Enter');

      await sleep(3000);

      // Verify page loaded
      await agent.aiWaitFor('Page has loaded');

      // Extract page info
      const pageInfo = await agent.aiQuery(
        '{title: string, hasContent: boolean}, extract page title and check if content exists',
      );
      console.log('Page info:', pageInfo);

      // Assert page content
      await agent.aiAssert('The page has text content');
    },
    720 * 1000,
  );
});
