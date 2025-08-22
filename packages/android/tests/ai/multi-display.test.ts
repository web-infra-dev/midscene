import { describe, it, vi } from 'vitest';
import { agentFromAdbDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'android multi display',
  async () => {
    await it('Android settings page demo for scroll', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
        displayId: 0,
        usePhysicalDisplayIdForDisplayLookup: true,
        usePhysicalDisplayIdForScreenshot: true,
      });

      await agent.aiAction('Take a photo');
    });
    await it('Android settings page demo for scroll', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
        displayId: 1,
        usePhysicalDisplayIdForDisplayLookup: true,
        usePhysicalDisplayIdForScreenshot: true,
      });

      await agent.aiAction('Click the top left icon');
    });
  },
  360 * 1000,
);
