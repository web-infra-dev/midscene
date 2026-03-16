import { describe, it, vi } from 'vitest';
import { agentFromAdbDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'Pinch zoom gesture',
  () => {
    it('Pinch: zoom in via aiAct', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');

      // Use aiAct to test that AI can plan and execute a pinch action
      await agent.aiAct('pinch to zoom in on the screen');
    });

    it('Pinch: zoom out via aiAct', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');

      // Use aiAct to test that AI can plan and execute a pinch action
      await agent.aiAct('pinch to zoom out on the screen');
    });

    it('Pinch: use aiPinch API directly', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');

      // Test the direct aiPinch API
      await agent.aiPinch(undefined, { scale: 2 });
      await agent.aiPinch(undefined, { scale: 0.5 });
    });
  },
  360 * 1000,
);
