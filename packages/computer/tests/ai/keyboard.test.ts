import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('computer keyboard operations', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    const device = new ComputerDevice({});
    agent = new ComputerAgent(device, {
      aiActionContext:
        'You are testing keyboard operations on a desktop computer.',
    });
    await device.connect();
  });

  it(
    'keyboard shortcuts test',
    async () => {
      const isMac = process.platform === 'darwin';

      // Take screenshot to verify current screen state
      const initialState = await agent.aiQuery(
        '{hasVisibleContent: boolean}, check if there is visible content on screen',
      );
      console.log('Initial screen state:', initialState);

      // Verify screen has content
      await agent.aiAssert('The screen has visible content');

      // Test opening search/Spotlight
      if (isMac) {
        await agent.aiAct('press Cmd+Space to open Spotlight search');
        await sleep(1000);

        // Close Spotlight
        await agent.aiAct('press Escape to close');
        await sleep(500);
      } else {
        await agent.aiAct('press Windows key to open Start menu');
        await sleep(1000);

        // Close Start menu
        await agent.aiAct('press Escape to close');
        await sleep(500);
      }

      // Test app switcher shortcuts
      if (isMac) {
        await agent.aiAct('press Cmd+Tab to show app switcher');
        await sleep(500);
        await agent.aiAct('press Escape or release keys to close app switcher');
      } else {
        await agent.aiAct('press Alt+Tab to show app switcher');
        await sleep(500);
        await agent.aiAct('press Escape to close');
      }
      await sleep(500);

      // Test mouse movement
      await agent.aiAct('move mouse to the center of screen');
      await sleep(300);

      // Take screenshot to verify final state
      const finalState = await agent.aiQuery(
        '{hasVisibleContent: boolean}, check current screen state',
      );
      console.log('Final screen state:', finalState);

      await agent.aiAssert('Screen content is still visible');
    },
    360 * 1000,
  );
});
