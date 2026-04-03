import { describe, it, vi } from 'vitest';
import { agentFromHdcDevice } from '../../src';

vi.setConfig({
  testTimeout: 360 * 1000,
});

describe(
  'Verify scroll fix - fling for scroll',
  () => {
    it('scroll down two screens then up two screens', async () => {
      const agent = await agentFromHdcDevice(undefined, {
        aiActionContext:
          'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
      });

      await agent.launch('com.huawei.hmos.settings');

      await agent.aiAct('scroll down one screen');
      await agent.aiAct('scroll down one screen');
      await agent.aiAssert('the settings list is not at the top');

      await agent.aiAct('scroll up one screen');
      await agent.aiAct('scroll up one screen');
      await agent.aiAssert('the settings list is near the top');
    });
  },
  360 * 1000,
);
