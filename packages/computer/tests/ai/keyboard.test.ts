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

      // Test basic keyboard input - type some text
      // First move mouse to a safe area
      await agent.aiAct('move mouse to center of screen');
      await sleep(300);

      // Test modifier key combinations
      if (isMac) {
        // Cmd+Shift+4 to start screenshot selection (then Escape to cancel)
        await agent.aiAct('press Command+Shift+4');
        await sleep(500);
        await agent.aiAct('press Escape');
        await sleep(300);
      } else {
        // Win+D to show desktop, then Win+D again to restore
        await agent.aiAct('press Win+D to show desktop');
        await sleep(1000);
        await agent.aiAct('press Win+D to restore windows');
        await sleep(500);
      }

      // Test arrow keys
      await agent.aiAct('press ArrowUp key');
      await sleep(200);
      await agent.aiAct('press ArrowDown key');
      await sleep(200);

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
