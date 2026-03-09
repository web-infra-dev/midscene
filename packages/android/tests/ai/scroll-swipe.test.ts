import { describe, it, vi } from 'vitest';
import { agentFromAdbDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'Scroll vs Swipe semantic distinction',
  () => {
    it('Scroll: browse content in Settings app', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.android.settings/.Settings');

      await agent.aiAct('scroll down one screen');
      await agent.aiAssert('the settings list is not at the top');

      await agent.aiAct('scroll up one screen');
      await agent.aiAssert('the settings list is near the top');
    });

    it('Swipe: flip photos in Gallery app', async () => {
      const devices = await getConnectedDevices();
      const agent = await agentFromAdbDevice(devices[0].udid, {
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.aiAct('Open the Gallery app');

      await agent.aiAct('click the first photo to open it');
      await agent.aiAct('swipe left to view the next photo');
      await agent.aiAct('swipe left to view the next photo');
      await agent.aiAct('swipe right to go back to the previous photo');
    });
  },
  360 * 1000,
);
