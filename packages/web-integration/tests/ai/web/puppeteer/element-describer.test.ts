import { PuppeteerAgent } from '@/puppeteer';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

describe(
  'Element Describer Tests',
  () => {
    const ctx = createTestContext();

    it('element describer', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const { center } = await ctx.agent.aiLocate('the input field for search');
      const describeResult = await ctx.agent.describeElementAtPoint(center);
      expect(describeResult.verifyResult?.pass).toBe(true);
      expect(describeResult.verifyResult?.rect).toBeTruthy();
      expect(describeResult.verifyResult?.center).toBeTruthy();
    });

    it('element describer - deep think', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const { center } = await ctx.agent.aiLocate('the input field for search');
      const describeResult = await ctx.agent.describeElementAtPoint(center, {
        deepThink: true,
        centerDistanceThreshold: 100,
      });
      expect(describeResult.verifyResult?.pass).toBe(true);
      expect(describeResult.verifyResult?.rect).toBeTruthy();
      expect(describeResult.verifyResult?.center).toBeTruthy();
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
