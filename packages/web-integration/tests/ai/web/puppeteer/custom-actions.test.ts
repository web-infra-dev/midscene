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

    it('append custom action - UploadFile is invoked', async () => {
      const htmlPath = getFixturePath('local-search.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;

      const uploadCalled = vi.fn();
      const UploadFile = defineAction({
        name: 'UploadFile',
        description: 'Upload a local file to current page',
        paramSchema: z.object({
          filePath: z.string().describe('Absolute or relative local file path'),
        }),
        call: async (param) => {
          uploadCalled(param.filePath);
        },
      });

      ctx.agent = new PuppeteerAgent(originPage, {
        customActions: [UploadFile],
      });

      await ctx.agent.aiAct(
        'Upload a local file to current page, which path is /tmp/demo.txt',
      );

      expect(uploadCalled).toHaveBeenCalledTimes(1);
      expect(uploadCalled).toHaveBeenCalledWith('/tmp/demo.txt');
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
