import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('computer basic operations', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    const device = new ComputerDevice({});
    agent = new ComputerAgent(device, {
      aiActionContext:
        'You are controlling a desktop computer. This is a test environment.',
    });
    await device.connect();
  });

  it(
    'basic desktop interactions',
    async () => {
      // Take screenshot and query screen info
      const screenInfo = await agent.aiQuery(
        '{width: number, height: number, hasContent: boolean}, get current screen resolution and check if screen has visible content',
      );
      console.log('Screen info:', screenInfo);

      // Move mouse
      await agent.aiAct('move mouse to the center of the screen');
      await sleep(500);

      // Verify screen has content
      await agent.aiAssert('The screen has visible content');

      // Test moving mouse to corners
      await agent.aiAct('move mouse to the top-left corner of the screen');
      await sleep(500);

      await agent.aiAct('move mouse to the bottom-right corner of the screen');
      await sleep(500);
    },
    360 * 1000,
  );
});
