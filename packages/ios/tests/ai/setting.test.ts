import { describe, it, vi } from 'vitest';
import {
  agentFromIOSDevice,
  getConnectedDevices,
  checkIOSEnvironment,
} from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'iOS settings page',
  async () => {
    await it('iOS settings page demo for scroll', async () => {
      // Check if iOS environment is available before running tests
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        throw new Error(`iOS environment check failed: ${envCheck.error}`);
      }

      const devices = await getConnectedDevices();
      if (devices.length === 0) {
        throw new Error(
          'No iOS devices/simulators available. Please ensure you have iOS simulators installed and available.',
        );
      }

      // Find a booted device or use the first available one
      const device = devices.find((d) => d.state === 'Booted') || devices[0];
      console.log(`Using iOS device: ${device.name} (${device.udid})`);

      const agent = await agentFromIOSDevice(device.udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
        autoDismissKeyboard: false, // Disable auto keyboard dismissal to avoid extra "done" text
      });

      await agent.launch('com.apple.Preferences');
      await agent.aiAction('在搜索框输入 develop');
      await agent.aiAction('点击 Developer');
      await agent.aiAction('滚动到最底部');
    });
  },
  360 * 1000,
);
