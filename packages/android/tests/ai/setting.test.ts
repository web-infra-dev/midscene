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
        scrcpyConfig: {
          enabled: true,
        },
      });

      await agent.aiScroll('视频播放进度条上的小圆点', {
        direction: 'left',
        distance: 100,
      });
    });
  },
  360 * 1000,
);
