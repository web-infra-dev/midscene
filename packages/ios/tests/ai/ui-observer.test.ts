import { sleep } from '@midscene/core/utils';
import { describe, expect, it, vi } from 'vitest';
import { agentFromWebDriverAgent, checkIOSEnvironment } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

/**
 * Real-device test for UI observation on iOS (WDA MJPEG stream sampling
 * instead of slow per-call takeScreenshot).
 *
 * Scenario: while the observer is running, the screen transitions from the
 * Settings app to the home screen — a dynamic change that NO single
 * screenshot can contain. The observed window must include both screens.
 */
describe(
  'iOS UI observer (WDA MJPEG frame source)',
  () => {
    it('observes a screen transition that no single screenshot can contain', async () => {
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        throw new Error(`iOS environment check failed: ${envCheck.error}`);
      }

      const agent = await agentFromWebDriverAgent({
        autoDismissKeyboard: false,
        wdaMjpegFrameSource: {
          enabled: true,
        },
      });

      try {
        // The continuous frame source must be wired (opt-in).
        const device = agent.page as any;
        expect(typeof device.openFrameSource).toBe('function');

        await agent.launch('com.apple.Preferences');
        await sleep(2000); // let the foreground app settle

        const observer = await agent.startObserving({ intervalMs: 600 });
        await sleep(1200);
        await device.home(); // transition mid-window
        await sleep(1800);
        await observer.stop();

        expect(observer.frameCount).toBeGreaterThanOrEqual(3);

        // The prompt is agnostic to WHAT the starting screen shows (an app,
        // or a system dialog covering it) — it only asserts the transition.
        await observer.aiAssert(
          'comparing the earlier and later frames, the screen transitions from one screen to a clearly different one, and the iOS home screen (launcher with app icons) appears in the later frames',
        );

        // Negative sanity: the model must not rubber-stamp "true" for
        // anything asked about the observed window.
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
