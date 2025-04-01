import { describe, it, vi } from 'vitest';
import { agentFromDeviceId, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'android integration',
  async () => {
    await it('Android settings page demo for scroll', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromDeviceId(devices[0].udid);

      await agent.launch('com.android.settings/.Settings');

      await agent.aiAction('scroll list to bottom');
      await agent.aiAction('open "More settings"');
      await agent.aiAction('scroll list to bottom');
      await agent.aiAction('scroll list to top');
      await agent.aiAction('swipe down one screen');
      await agent.aiAction('swipe up one screen');
    });
  },
  360 * 1000,
);
