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

/**
 * Real-world reproduction of issues #1653 / #2100 / #2272.
 *
 * A user signs in and the page shows a short-lived "Login failed" toast that
 * appears ~1.5s after the click and auto-hides ~1.8s later. The whole flow is
 * driven by real agent actions (aiTap / aiInput / aiBoolean) against the page's
 * natural behavior:
 *  - a single screenshot, captured right after the click (before the toast
 *    appears), misses it;
 *  - the `frameSequence` switch captures several frames across the window, so
 *    the model observes the transient toast.
 */
describe(
  'puppeteer integration - frameSequence (transient toast)',
  () => {
    const ctx = createTestContext();

    it.skipIf(!canRunAiTest)(
      'observes a transient login-failed toast triggered by a real click',
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

        // Real form interaction.
        await ctx.agent.aiInput('the username field', { value: 'test-user' });
        await ctx.agent.aiInput('the password field', { value: 'wrong-pass' });

        // --- Control: single screenshot (switch OFF) ---
        // Click "Sign in". The page reveals the error toast ~1.5s later. The
        // default single-frame check captures right after the click, before the
        // toast appears, so the model does not see it.
        await ctx.agent.aiTap('the Sign in button');
        const seenWithSingleFrame = await ctx.agent.aiBoolean(
          'an error toast or "login failed" message is visible on the page right now',
        );

        // --- Frame sequence: switch ON ---
        // Click "Sign in" again to trigger a fresh toast and observe a sequence
        // of frames across the toast's visible window (7 frames at 500ms).
        await ctx.agent.aiTap('the Sign in button');
        const seenWithFrameSequence = await ctx.agent.aiBoolean(
          'a "login failed" error toast appears in any of these frames',
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
