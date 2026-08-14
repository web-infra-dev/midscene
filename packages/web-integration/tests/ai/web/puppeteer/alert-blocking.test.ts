import { pathToFileURL } from 'node:url';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

vi.setConfig({ testTimeout: DEFAULT_TEST_TIMEOUT });

describe('puppeteer native alert virtual surface', () => {
  const ctx = createTestContext();

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('keeps JavaScript blocked until AI clicks OK on the fake alert image', async () => {
    const fixtureUrl = pathToFileURL(
      getFixturePath('alert-blocking.html'),
    ).href;
    const { originPage, reset } = await launchPage(fixtureUrl, {
      viewport: { width: 900, height: 700, deviceScaleFactor: 1 },
    });
    ctx.resetFn = reset;
    ctx.agent = new PuppeteerAgent(originPage);

    let dialogSeenAt = 0;
    originPage.once('dialog', () => {
      dialogSeenAt = Date.now();
    });

    await ctx.agent.aiTap('the Open alert button');
    expect(dialogSeenAt).toBeGreaterThan(0);

    let blockedEvaluationSettled = false;
    const blockedEvaluation = originPage
      .evaluate(() => window.__alertBlockingFixture)
      .then((value) => {
        blockedEvaluationSettled = true;
        return value;
      });

    await sleep(300);
    expect(blockedEvaluationSettled).toBe(false);

    await ctx.agent.aiTap('the blue OK button on the alert dialog');

    const fixtureState = await blockedEvaluation;
    expect(fixtureState.phase).toBe('resumed');
    expect(fixtureState.afterAlertAt).toBeTypeOf('number');
    expect(fixtureState.blockedForMs).toBeGreaterThanOrEqual(300);
    expect(fixtureState.afterAlertAt).toBeGreaterThanOrEqual(dialogSeenAt);
    expect(Math.abs(Date.now() - fixtureState.afterAlertAt)).toBeLessThan(
      10_000,
    );

    await expect(
      originPage.$eval('#execution-state', (node) => node.textContent),
    ).resolves.toBe('Resumed after alert');
  });
});

declare global {
  interface Window {
    __alertBlockingFixture: {
      phase: string;
      beforeAlertAt: number | null;
      afterAlertAt: number | null;
      blockedForMs: number | null;
    };
  }
}
