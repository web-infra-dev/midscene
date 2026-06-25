import { PuppeteerAgent } from '@/puppeteer';
import { globalModelConfigManager } from '@midscene/shared/env';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

const modelConfig = globalModelConfigManager.getModelConfig('default');
const canRunAiTest = !!modelConfig.modelFamily && !!modelConfig.openaiApiKey;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

declare global {
  interface Window {
    flashToast: (appearDelay: number, visibleMs: number) => void;
  }
}

/**
 * Reproduces issues #1653 / #2100 / #2272: a short-lived toast appears after an
 * action and auto-hides. A single screenshot easily misses it, while the
 * `frameSequence` switch captures several frames over a time window so the
 * model can observe the transient toast.
 */
describe(
  'puppeteer integration - frameSequence (transient toast)',
  () => {
    const ctx = createTestContext();

    it.skipIf(!canRunAiTest)(
      'observes a transient toast that a single screenshot misses',
      async () => {
        const htmlPath = getFixturePath('transient-toast.html');
        const { originPage, reset } = await launchPage(`file://${htmlPath}`, {
          viewport: {
            width: 1280,
            height: 720,
          },
        });
        ctx.resetFn = reset;
        ctx.agent = new PuppeteerAgent(originPage);

        // --- Control: single screenshot (switch OFF) ---
        // Trigger the toast: it appears ~1.5s later and stays for ~1.2s. The
        // default single-frame capture happens immediately (well before the
        // toast appears), so the model should not see any toast right now.
        await originPage.evaluate(() => window.flashToast(1500, 1200));
        const seenWithSingleFrame = await ctx.agent.aiBoolean(
          'an error toast or notification message is visible on the page right now',
        );

        // Let the toast fully disappear before the next round.
        await sleep(3000);

        // --- Frame sequence: switch ON ---
        // Trigger the same toast and capture 7 frames at 500ms intervals
        // (~3s window). Some frames fall inside the toast's visible window, so
        // the model can observe it.
        await originPage.evaluate(() => window.flashToast(1500, 1200));
        const seenWithFrameSequence = await ctx.agent.aiBoolean(
          'an error toast or notification message appears in any of these frames',
          { frameSequence: { count: 7, intervalMs: 500 } },
        );

        // The switch lets the model catch the transient toast...
        expect(seenWithFrameSequence).toBe(true);
        // ...whereas a single screenshot taken before it appears misses it.
        expect(seenWithSingleFrame).toBe(false);
      },
      DEFAULT_TEST_TIMEOUT,
    );
  },
  DEFAULT_TEST_TIMEOUT,
);
