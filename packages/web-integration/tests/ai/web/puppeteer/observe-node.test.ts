import { PuppeteerAgent } from '@/puppeteer';
import { globalModelConfigManager } from '@midscene/shared/env';
import { describe, expect, it } from '@rstest/core';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

const modelConfig = process.env.MIDSCENE_MODEL_NAME
  ? globalModelConfigManager.getModelConfig('default')
  : undefined;
const canRunAiTest = !!modelConfig?.modelFamily && !!modelConfig.openaiApiKey;

describe('standard observe Node with a real browser', () => {
  const ctx = createTestContext();
  it.skipIf(!canRunAiTest)(
    'records transient UI and retains a failed assertion window',
    async () => {
      const { originPage, reset } = await launchPage(
        `file://${getFixturePath('transient-toast.html')}`,
        {
          viewport: { width: 1280, height: 720 },
        },
      );
      ctx.resetFn = reset;
      const agent = new PuppeteerAgent(originPage);
      ctx.agent = agent;
      const node = PuppeteerAgent.getTestRunnerNodeDefinitions().find(
        (node) => node.name === 'observe',
      )!;
      const signal = AbortSignal.timeout(DEFAULT_TEST_TIMEOUT - 10_000);
      const run = (assert: string) =>
        node.execute(
          agent,
          {
            act: 'Click the Sign in button once.',
            settleMs: 4000,
            assert,
          },
          { signal },
        );
      const result = await run(
        'A red toast saying Login failed: incorrect password appeared during the observed process.',
      );
      expect(result?.data).toMatchObject({ pass: true });
      expect(
        (result?.data as { frameCount: number }).frameCount,
      ).toBeGreaterThan(1);
      expect(
        (result?.data as { durationMs: number }).durationMs,
      ).toBeGreaterThanOrEqual(4000);

      const failure = await Promise.resolve(
        run('A green SUCCESS banner appeared during the observed process.'),
      ).catch((error) => error);
      expect(failure).toMatchObject({
        code: 'NODE_EXECUTION_ERROR',
        output: { data: { pass: false } },
      });
      expect(failure.output.data.frameCount).toBeGreaterThan(1);
      expect(failure.output.data.durationMs).toBeGreaterThanOrEqual(4000);
    },
    DEFAULT_TEST_TIMEOUT,
  );
});
