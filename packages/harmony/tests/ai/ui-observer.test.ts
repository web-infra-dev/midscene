import { sleep } from '@midscene/core/utils';
import { describe, expect, it, rs } from '@rstest/core';
import { agentFromHdcDevice, getConnectedDevices } from '../../src';

rs.setConfig({
  testTimeout: 240 * 1000,
});

/**
 * Real-device test for UI observation on HarmonyOS (screenshot fallback
 * sampling + deferred assertion against the captured window).
 *
 * Scenario: while the observer is running, the screen transitions from the
 * Settings app to the home screen — a dynamic change that NO single
 * screenshot can contain. The observed window must include both screens.
 */
describe(
  'harmony UI observer (screenshot fallback frame source)',
  () => {
    it('observes a screen transition that no single screenshot can contain', async () => {
      const devices = await getConnectedDevices();
      expect(devices.length).toBeGreaterThan(0);
      const agent = await agentFromHdcDevice(devices[0].deviceId, {
        aiActionContext:
          'This is a HarmonyOS device. The system language is Chinese. If any popup appears, dismiss or agree to it.',
      });

      try {
        await agent.launch('com.huawei.hmos.settings');
        await sleep(2000);

        const observer = await agent.startObserving({ intervalMs: 800 });
        await sleep(1600);
        await agent.home();
        await sleep(2000);
        await observer.stop();

        expect(observer.frameCount).toBeGreaterThanOrEqual(3);

        await observer.aiAssert(
          'comparing the earlier and later frames, the screen transitions from the Settings app to the home screen (launcher / desktop)',
        );

        const sawCalculator = await observer.aiBoolean(
          'a calculator app interface appears in any of these frames',
        );
        expect(sawCalculator).toBe(false);
      } finally {
        await agent.destroy();
      }
    });
  },
  240 * 1000,
);
