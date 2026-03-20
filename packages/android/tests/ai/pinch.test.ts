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

      await agent.aiAct('pinch to zoom in on the screen');
    });

    it('Pinch: zoom out via aiAct', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');

      await agent.aiAct('pinch to zoom out on the screen');
    });

    it('Pinch: use aiPinch API directly', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');

      // pinch out = zoom in, pinch in = zoom out
      await agent.aiPinch(undefined, { direction: 'out' });
      await agent.aiPinch(undefined, { direction: 'in', distance: 200 });
    });
  },
  360 * 1000,
);
