import { describe, it, rs } from '@rstest/core';
import { agentFromHdcDevice } from '../../src';

rs.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'HarmonyOS settings page',
  () => {
    it('HarmonyOS settings page demo for scroll', async () => {
      const agent = await agentFromHdcDevice(undefined, {
        aiActionContext:
          'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
      });

      await agent.launch('com.huawei.hmos.settings');
      await agent.aiAct('scroll list to bottom');
      await agent.aiAct('scroll list to top');
      await agent.aiAct('scroll down one screen');
      await agent.aiAct('scroll up one screen');
    });
  },
  360 * 1000,
);
