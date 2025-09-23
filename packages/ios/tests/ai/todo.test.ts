import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  agentFromIOSDevice,
  checkIOSEnvironment,
  getConnectedDevices,
} from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
  hookTimeout: 240 * 1000, // Add hook timeout for beforeAll
});

const bundleId = 'com.apple.mobilesafari'; // Using Safari to browse TodoMVC

describe('Test todo list', () => {
  let agent: any;

  beforeAll(async () => {
    // Check if iOS environment is available before running tests
    const envCheck = await checkIOSEnvironment();
    if (!envCheck.available) {
      throw new Error(`iOS environment check failed: ${envCheck.error}`);
    }

    const devices = await getConnectedDevices();
    if (devices.length === 0) {
      throw new Error('No iOS devices available');
    }

    agent = await agentFromIOSDevice('00008120-0012144121E0201E', {
      wdaPort: 8100,
      wdaHost: 'localhost', // Using port forwarding via iproxy
      aiActionContext:
        'If any location, permission, user agreement, cookies popup, click agree or allow. If login page pops up, close it.',
    });
    await agent.launch(bundleId);
    await sleep(3000);

    // Navigate to TodoMVC website
    await agent.aiAction('tap on the address bar');
    await agent.aiAction('type "https://todomvc.com/examples/react/dist/"');
    await agent.aiAction('press Enter or tap Go');
    await sleep(5000); // Wait for page to load
  }, 240 * 1000); // Explicit timeout for beforeAll

  it(
    'ai todo',
    async () => {
      if (!agent) {
        console.warn('Agent not initialized, skipping test');
        return;
      }

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
        'tap the delete button on the right of the second task',
      );
      await agent.aiAction(
        'tap the check button on the left of the second task',
      );
      await agent.aiAction(
        "tap the 'completed' status button below the task list",
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
