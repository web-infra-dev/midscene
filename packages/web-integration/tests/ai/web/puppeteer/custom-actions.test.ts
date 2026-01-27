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
        description:
          'Execute a named job task. This is a custom action that accepts a job name and runs it.',
        paramSchema: z.object({
          job: z.string().describe('The name of the job to execute'),
        }),
        call: async (param) => {
          doAJobCalled(param.job);
        },
      });

      ctx.agent = new PuppeteerAgent(originPage, {
        customActions: [DoAJob],
        aiActContext:
          'When asked to execute or do a job, you MUST use the "DoAJob" custom action. Do NOT try to perform the job through UI interactions.',
      });

      await ctx.agent.aiAct('Execute the DoAJob action with job "say hello"');

      expect(doAJobCalled).toHaveBeenCalled();
      const allArgs = doAJobCalled.mock.calls.map((c: any[]) => c[0]);
      expect(allArgs.some((arg: string) => arg.includes('say hello'))).toBe(
        true,
      );
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
