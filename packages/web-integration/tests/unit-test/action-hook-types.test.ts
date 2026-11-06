import type { PlaywrightPageAgentOpt } from '@/playwright/agent';
import { Page } from '@/puppeteer/base-page';
import type { PuppeteerPageAgentOpt } from '@/puppeteer/page-agent';
import { describe, expect, it } from '@rstest/core';

type HookOptions = Pick<
  PlaywrightPageAgentOpt & PuppeteerPageAgentOpt,
  'beforeInvokeAction' | 'afterInvokeAction'
>;

describe('public web action hook options', () => {
  for (const adapter of ['playwright', 'puppeteer'] as const) {
    it(`passes the action name and parameters to typed ${adapter} hooks`, async () => {
      const calls: unknown[][] = [];
      const options: HookOptions = {
        beforeInvokeAction: async (name: string, param: { value: string }) => {
          calls.push(['before', name, param]);
        },
        afterInvokeAction: async (name: string, param: { value: string }) => {
          calls.push(['after', name, param]);
        },
      };
      const page = new Page({} as never, adapter, options);
      const param = { value: 'replacement' };

      await page.beforeInvokeAction('Input', param);
      await page.afterInvokeAction('Input', param);

      expect(calls).toEqual([
        ['before', 'Input', param],
        ['after', 'Input', param],
      ]);
      expect(calls[0][2]).toBe(param);
      expect(calls[1][2]).toBe(param);
    });
  }

  it('continues to accept callbacks that ignore the arguments', async () => {
    const calls: string[] = [];
    const options: HookOptions = {
      beforeInvokeAction: async () => {
        calls.push('before');
      },
      afterInvokeAction: async () => {
        calls.push('after');
      },
    };
    const page = new Page({} as never, 'playwright', options);

    await page.beforeInvokeAction('Input', { value: 'replacement' });
    await page.afterInvokeAction('Input', { value: 'replacement' });

    expect(calls).toEqual(['before', 'after']);
  });
});
