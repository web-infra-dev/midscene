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

      // Test mouse movement
      await agent.aiAct('move mouse to center of screen');
      await sleep(300);

      // Test modifier key combinations
      if (isMac) {
        // Cmd+Tab to show app switcher
        await agent.aiAct('press Command+Tab');
        await sleep(500);
        // Press Command alone to release and dismiss app switcher
        await agent.aiAct('press Command');
        await sleep(300);
      } else {
        // Alt+Tab to show app switcher
        await agent.aiAct('press Alt+Tab');
        await sleep(500);
        // Click to dismiss (Alt alone may not work on Windows)
        await agent.aiAct('click mouse');
        await sleep(300);
      }

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
