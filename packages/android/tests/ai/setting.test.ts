import { sleep } from '@midscene/core/utils';
import { describe, it, vi } from 'vitest';
import { agentFromAdbDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'android settings page',
  async () => {
    it('Android settings page demo for scroll', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
        scrcpyConfig: {
          enabled: true,
        },
      });

      await agent.launch('com.android.settings/.Settings');
      await sleep(2000);
      await agent.aiAct('进入 WLAN 设置页面');
    });
  },
  360 * 1000,
);
