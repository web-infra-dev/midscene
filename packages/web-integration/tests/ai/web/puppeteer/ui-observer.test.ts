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

/**
 * Real-world reproduction of issues #962 / #1653 / #2100 / #2272.
 *
 * A user signs in and the page shows a short-lived "Login failed" toast that
 * appears ~1.5s after the click and auto-hides ~1.8s later. The whole flow is
 * driven by real agent actions against the page's natural behavior:
 *  - a single screenshot, captured right after the click (before the toast
 *    appears), misses it;
 *  - a UI observer running across the action window catches it.
 */
describe(
  'puppeteer integration - UI observer (transient toast)',
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

        // Web pages always expose the CDP screencast frame source.
        expect(typeof (ctx.agent.page as any).openFrameSource).toBe('function');

        // Real form interaction.
        await ctx.agent.aiInput('the username field', { value: 'test-user' });
        await ctx.agent.aiInput('the password field', { value: 'wrong-pass' });

        // --- Control: single screenshot misses the transient toast ---
        // Click "Sign in". The page reveals the error toast ~1.5s later; the
        // single-frame check captures right after the click, before it shows.
        await ctx.agent.aiTap('the Sign in button');
        const seenWithSingleFrame = await ctx.agent.aiBoolean(
          'an error toast or "login failed" message is visible on the page right now',
        );

        // Let the first toast fully disappear before the observed round.
        await sleep(3500);

        // --- Observer: the window spans the action and catches the toast ---
        const observer = await ctx.agent.startObserving({ intervalMs: 500 });
        await ctx.agent.aiTap('the Sign in button');
        await sleep(3800); // cover the toast's appear+hide window
        await observer.stop();

        expect(observer.frameCount).toBeGreaterThanOrEqual(4);
        await observer.aiAssert(
          'a "login failed" error toast appeared at some point during the observed process',
        );

        // ...whereas a single screenshot taken before it appears misses it.
        expect(seenWithSingleFrame).toBe(false);
      },
      DEFAULT_TEST_TIMEOUT,
    );
  },
  DEFAULT_TEST_TIMEOUT,
);
