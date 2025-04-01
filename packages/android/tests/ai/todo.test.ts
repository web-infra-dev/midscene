import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

const pageUrl = 'https://todomvc.com/examples/react/dist/';

describe('Test todo list', () => {
  let agent: AndroidAgent;

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    const page = new AndroidDevice(devices[0].udid);
    agent = new AndroidAgent(page);
    await page.connect();
    await page.launch(pageUrl);
  });

  it(
    'ai todo',
    async () => {
      await agent.aiAction(
        "type 'Study JS today' in the task box input and press the Enter key",
      );
      await agent.aiAction(
        "type 'Study Rust tomorrow' in the task box input and press the Enter key",
      );
      await agent.aiAction(
        "type 'Study AI the day after tomorrow' in the task box input and press the Enter key",
      );
      await agent.aiAction(
        'move the mouse to the second item in the task list and click the delete button on the right of the second task',
      );
      await agent.aiAction(
        'click the check button on the left of the second task',
      );
      await agent.aiAction(
        "click the 'completed' status button below the task list",
      );

      const list = await agent.aiQuery('string[], the complete task list');
      expect(list.length).toEqual(1);

      await agent.aiAssert(
        'Near the bottom of the list, there is a tip shows "1 item left".',
      );
    },
    720 * 1000,
  );
});
