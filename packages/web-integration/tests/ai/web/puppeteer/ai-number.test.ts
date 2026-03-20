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

describe(
  'puppeteer integration - aiNumber',
  () => {
    const ctx = createTestContext();

    it.skipIf(!canRunAiTest)(
      'extracts the weather temperature from a real local page',
      async () => {
        const htmlPath = getFixturePath('search-engine.html');
        const { originPage, reset } = await launchPage(`file://${htmlPath}`, {
          viewport: {
            width: 1280,
            height: 720,
          },
        });
        ctx.resetFn = reset;
        ctx.agent = new PuppeteerAgent(originPage, {
          cacheId: 'test-ai-number-weather-temperature',
        });

        await ctx.agent.aiAct(
          'type "weather today" in search box, click search button',
        );
        await ctx.agent.aiWaitFor(
          'there is a weather card showing the current temperature',
        );

        const temperature = await ctx.agent.aiNumber(
          'the current temperature number shown in the weather card',
        );

        expect(temperature).toBeTypeOf('number');
        expect(Number.isFinite(temperature)).toBe(true);
      },
    );
  },
  DEFAULT_TEST_TIMEOUT,
);
