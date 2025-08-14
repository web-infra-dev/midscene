import { describe, it, vi } from 'vitest';
import { agentFromAdbDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'android integration',
  async () => {
    await it('Android settings page demo for scroll', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');
      await agent.aiAction('pull down to refresh');
      await agent.aiAction('long press chat list first chat');
      await agent.aiAction('click recent apps button');
      await agent.aiAction('click android home button');
      await agent.aiAction('scroll list to bottom');
      await agent.aiAction('open "More settings"');
      await agent.aiAction('scroll left until left edge');
      await agent.aiAction('scroll right until right edge');
      await agent.aiAction('scroll list to top');
      await agent.aiAction('scroll list to bottom');
      await agent.aiAction('scroll down one screen');
      await agent.aiAction('scroll up one screen');
      await agent.aiAction('scroll right one screen');
      await agent.aiAction('scroll left one screen');
    });
  },
  360 * 1000,
);
