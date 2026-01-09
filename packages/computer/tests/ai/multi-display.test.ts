import { sleep } from '@midscene/core/utils';
import { describe, it, vi } from 'vitest';
import { ComputerDevice, agentFromComputer } from '../../src';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('computer multi display', () => {
  it(
    'connect to multiple displays',
    async () => {
      // List all displays
      const displays = await ComputerDevice.listDisplays();
      console.log('Available displays:', displays);

      if (displays.length < 2) {
        console.warn(
          `Only ${displays.length} display(s) found, need at least 2 for multi-display test`,
        );
        // Still test single display
        if (displays.length === 1) {
          const agent = await agentFromComputer({
            displayId: displays[0].id,
          });
          await agent.aiAct('move mouse to center of screen');
          await agent.aiAssert('Screen has visible content');
        }
        return;
      }

      // Connect to first display
      const display1 = displays[0];
      console.log(
        `Connecting to display 1: ${display1.name} (ID: ${display1.id})`,
      );
      const agent1 = await agentFromComputer({
        displayId: display1.id,
        aiActionContext: `You are controlling display 1: ${display1.name}`,
      });

      // Operate on first display
      await agent1.aiAct('move mouse to center of screen');
      await sleep(500);
      const screen1Info = await agent1.aiQuery(
        '{hasContent: boolean}, check if display has visible content',
      );
      console.log('Display 1 info:', screen1Info);

      // Connect to second display
      const display2 = displays[1];
      console.log(
        `Connecting to display 2: ${display2.name} (ID: ${display2.id})`,
      );
      const agent2 = await agentFromComputer({
        displayId: display2.id,
        aiActionContext: `You are controlling display 2: ${display2.name}`,
      });

      // Operate on second display
      await agent2.aiAct('move mouse to center of screen');
      await sleep(500);
      const screen2Info = await agent2.aiQuery(
        '{hasContent: boolean}, check if display has visible content',
      );
      console.log('Display 2 info:', screen2Info);

      // Verify both displays have content
      await agent1.aiAssert('This display has visible content');
      await agent2.aiAssert('This display has visible content');

      console.log('Multi-display test completed successfully');
    },
    360 * 1000,
  );
});
