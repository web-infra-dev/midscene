import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('agent with forceSameTabNavigation', () => {
  let resetFn: () => Promise<void>;
  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('open new tab', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'puppeteer-open-new-tab',
    });
    const inputXpath =
      '/html/body/div[1]/div[1]/div[3]/div[2]/form[1]/div[1]/input[1]';
    await agent.aiInput('midscene github', 'The search input box', {
      xpath: inputXpath,
    });
    const log = await agent._unstableLogContent();
    expect(log.executions[0].tasks[0].hitBy?.from).toBe('User expected path');
    expect(log.executions[0].tasks[0].hitBy?.context?.xpath).toBe(inputXpath);
    await agent.aiKeyboardPress('Enter', 'The search input box', {
      xpath: inputXpath,
    });
    await sleep(5000);
    const log1 = await agent._unstableLogContent();
    expect(log1.executions[1].tasks[0].hitBy?.from).toBe('User expected path');
    expect(log1.executions[1].tasks[0].hitBy?.context?.xpath).toBe(inputXpath);
    await agent.aiTap('The search result link for "midscene" project');
    const log2 = await agent._unstableLogContent();
    expect(log2.executions[2].tasks[0].hitBy?.from).toBe('AI model');
    await sleep(5000);
    await agent.aiAssert('the page is about "midscene" project');
  });
});
