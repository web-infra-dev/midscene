import { describe, it, vi } from 'vitest';
import { agentFromAdbDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'android settings page',
  async () => {
    await it('Android settings page demo for scroll', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');
      await agent.aiAct('pull down to refresh');
      await agent.aiAct('long press chat list first chat');
      await agent.aiAct('click recent apps button');
      await agent.aiAct('click android home button');
      await agent.aiAct('scroll list to bottom');
      await agent.aiAct('open "More settings"');
      await agent.aiAct('scroll left until left edge');
      await agent.aiAct('scroll right until right edge');
      await agent.aiAct('scroll list to top');
      await agent.aiAct('scroll list to bottom');
      await agent.aiAct('scroll down one screen');
      await agent.aiAct('scroll up one screen');
      await agent.aiAct('scroll right one screen');
      await agent.aiAct('scroll left one screen');
    });
  },
  360 * 1000,
);
