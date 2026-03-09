import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HarmonyAgent, HarmonyDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
  hookTimeout: 240 * 1000,
});

const pageUrl = 'https://todomvc.com/examples/react/dist/';

describe('Test todo list', () => {
  let agent: HarmonyAgent;

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    const page = new HarmonyDevice(devices[0].deviceId);
    agent = new HarmonyAgent(page, {
      aiActionContext:
        'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
    });
    await page.connect();

    // Go to home screen, find and open the browser, then navigate to URL
    await page.home();
    await sleep(1000);
    await agent.aiAct('click the browser icon (浏览器) on the screen');
    await sleep(2000);
    await agent.aiAct(
      `click the search/URL bar, type "${pageUrl}" and press Enter to navigate`,
    );
    await sleep(5000);
  });

  it(
    'ai todo',
    async () => {
      await agent.aiAct(
        "type 'Study JS today' in the task box input and press the Enter key",
      );
      await agent.aiAct(
        "type 'Study Rust tomorrow' in the task box input and press the Enter key",
      );
      await agent.aiAct(
        "type 'Study AI the day after tomorrow' in the task box input and press the Enter key",
      );
      await agent.aiAct(
        'move the mouse to the second item in the task list and click the delete button on the right of the second task',
      );
      await agent.aiAct(
        'click the check button on the left of the second task',
      );
      await agent.aiAct(
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
