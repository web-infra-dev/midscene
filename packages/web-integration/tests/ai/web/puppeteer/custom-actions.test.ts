import { PuppeteerAgent } from '@/puppeteer';
import { z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

describe(
  'Custom Actions Tests',
  () => {
    const ctx = createTestContext();

    it('append custom action - DoAJob is invoked', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;

      const doAJobCalled = vi.fn();
      const DoAJob = defineAction({
        name: 'DoAJob',
        description: 'Do a job on the current page',
        paramSchema: z.object({
          job: z.string().describe('Job to be done'),
        }),
        call: async (param) => {
          doAJobCalled(param.job);
        },
      });

      ctx.agent = new PuppeteerAgent(originPage, {
        customActions: [DoAJob],
      });

      await ctx.agent.aiAct(
        'Do a job on the current page, which job is say hello',
      );

      expect(doAJobCalled).toHaveBeenCalledTimes(1);
      expect(doAJobCalled).toHaveBeenCalledWith('say hello');
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
