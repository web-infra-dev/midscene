import { PuppeteerAgent } from '@/puppeteer';
import {
  type ElementDescriberRuntime,
  describeElementAtPoint,
} from '@midscene/core';
import { getModelRuntime } from '@midscene/core/ai-model';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

async function getLogoCenter(
  page: Awaited<ReturnType<typeof launchPage>>['originPage'],
): Promise<[number, number]> {
  return (await page.$eval('.logo', (element) => {
    const rect = element.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  })) as [number, number];
}

function createElementDescriberRuntime(
  agent: PuppeteerAgent,
): ElementDescriberRuntime {
  return {
    service: agent.service,
    describeModelRuntime: getModelRuntime(
      agent.modelConfigManager.getModelConfig('insight'),
    ),
    locateModelRuntime: getModelRuntime(
      agent.modelConfigManager.getModelConfig('default'),
    ),
  };
}

describe(
  'Element Describer Tests',
  () => {
    const ctx = createTestContext();

    it('element describer', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const center = await getLogoCenter(originPage);
      const describeResult = await describeElementAtPoint(
        createElementDescriberRuntime(ctx.agent),
        center,
        {
          verifyPrompt: false,
          centerDistanceThreshold: 100,
          retryLimit: 5,
        },
      );
      expect(describeResult.prompt).toBeTruthy();
      expect(describeResult.verifyResult).toBeUndefined();
    });

    it('element describer - deep think', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const center = await getLogoCenter(originPage);
      const describeResult = await describeElementAtPoint(
        createElementDescriberRuntime(ctx.agent),
        center,
        {
          verifyPrompt: false,
          deepLocate: true,
          centerDistanceThreshold: 150,
          retryLimit: 5,
        },
      );
      expect(describeResult.prompt).toBeTruthy();
      expect(describeResult.verifyResult).toBeUndefined();
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
