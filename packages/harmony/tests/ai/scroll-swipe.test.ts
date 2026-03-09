import { describe, it, vi } from 'vitest';
import { agentFromHdcDevice } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'Scroll vs Swipe semantic distinction',
  () => {
    it('Scroll: browse content in Settings app', async () => {
      const agent = await agentFromHdcDevice(undefined, {
        aiActionContext:
          'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
      });

      await agent.launch('com.huawei.hmos.settings');

      await agent.aiAct('scroll down one screen');
      await agent.aiAssert('the settings list is not at the top');

      await agent.aiAct('scroll up one screen');
      await agent.aiAssert('the settings list is near the top');
    });

    it('Swipe: flip photos in Gallery app', async () => {
      const agent = await agentFromHdcDevice(undefined, {
        aiActionContext:
          'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
      });

      await agent.launch('com.huawei.hmos.photos');

      await agent.aiAct('click the first photo to open it');
      await agent.aiAct('swipe left to view the next photo');
      await agent.aiAct('swipe left to view the next photo');
      await agent.aiAct('swipe right to go back to the previous photo');
    });
  },
  360 * 1000,
);
