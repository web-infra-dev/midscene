import { Page } from '@/puppeteer/base-page';
import { Agent, type AgentOpt, ScreenshotItem } from '@midscene/core';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const screenshot =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Web Agent action readiness', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it.each(['unconfigured', 'custom'] as const)(
    '%s preserves lifecycle callbacks and selects the appropriate web waits',
    async (mode) => {
      const order: string[] = [];
      const rawPage = {
        url: () => 'https://example.com',
        mouse: {},
        keyboard: {},
        waitForSelector: rs.fn(async () => {}),
        waitForNetworkIdle: rs.fn(async () => {}),
      };
      const page = new Page(rawPage as any, 'puppeteer', {
        beforeInvokeAction: async () => {
          order.push('before');
        },
        afterInvokeAction: async () => {
          order.push('after');
        },
      });
      rs.spyOn(page, 'actionSpace').mockReturnValue([
        {
          name: 'Submit',
          delayBeforeRunner: 0,
          call: async () => {
            order.push('action');
          },
        },
      ]);
      const options: AgentOpt = {
        generateReport: false,
        autoPrintReportMsg: false,
        waitAfterAction: 0,
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'qwen2.5-vl-max',
          MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl',
          MIDSCENE_MODEL_API_KEY: 'test-key',
          MIDSCENE_MODEL_BASE_URL: 'https://api.sample.com/v1',
        },
      };
      if (mode !== 'unconfigured') {
        options.waitForActionReady = async () => {
          order.push('wait');
        };
      }
      const agent = new Agent(page, options);
      rs.spyOn(agent, 'getUIContext').mockResolvedValue({
        screenshot: ScreenshotItem.create(screenshot, Date.now()),
        shotSize: { width: 1, height: 1 },
        shrunkShotToLogicalRatio: 1,
      });
      await agent.callActionInActionSpace('Submit');
      const defaultWaits = mode === 'unconfigured';
      expect(rawPage.waitForNetworkIdle).toHaveBeenCalledTimes(
        defaultWaits ? 1 : 0,
      );
      expect(rawPage.waitForSelector).toHaveBeenCalledTimes(
        defaultWaits ? 1 : 0,
      );
      expect(order).toEqual(
        mode === 'custom'
          ? ['before', 'action', 'wait', 'after']
          : ['before', 'action', 'after'],
      );
    },
  );
});
