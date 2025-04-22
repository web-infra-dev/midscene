import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

describe('Test todo list', () => {
  let agent: AndroidAgent;

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    const page = new AndroidDevice(devices[0].udid);
    agent = new AndroidAgent(page, {
      aiActionContext:
        'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
    });
    await page.connect();
  });

  it(
    'travel',
    async () => {
      await agent.aiAction('open Weather app');
      await agent.aiAction(
        'click plus create button on the left top corner, enter search page, search "Hangzhou"',
      );
      await agent.aiAction(
        'if there is one day without rain on screen, click Android System Button "Home" to return to Home Screen',
      );
      await agent.aiAction('open Maps app, search "West Lake"');
      await agent.aiAction(
        'click the first search result, enter the attraction details page',
      );
      await agent.aiAction(
        'click "Directions" button, enter the route planning page',
      );
      await agent.aiAction('click "Start" button to start navigation');
    },
    720 * 1000,
  );
});
