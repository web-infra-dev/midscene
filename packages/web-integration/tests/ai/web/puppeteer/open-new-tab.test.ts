import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

const FIXTURES_DIR = path.join(__dirname, '../../fixtures');
const getFixturePath = (filename: string) => path.join(FIXTURES_DIR, filename);

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('agent with forceSameTabNavigation', () => {
  let resetFn: () => Promise<void>;
  let agent: PuppeteerAgent;

  afterEach(async () => {
    if (agent) {
      await agent.destroy();
    }
    if (resetFn) {
      await resetFn();
    }
  });

  it('open new tab', async () => {
    const htmlPath = getFixturePath('search-engine.html');
    const { originPage, reset } = await launchPage(`file://${htmlPath}`);
    resetFn = reset;
    agent = new PuppeteerAgent(originPage, {
      cacheId: 'puppeteer-open-new-tab',
      // Use directory-based report format: screenshots saved as separate PNG files
      // instead of being inlined as base64. Report must be served via HTTP server.
      useDirectoryReport: true,
    });
    const inputXpath = '//*[@id="search-input"]';
    await agent.aiInput('The search input box', {
      value: 'midscene github',
      xpath: inputXpath,
    });
    const log = await agent._unstableLogContent();
    expect(log.executions[0].tasks[0].hitBy?.from).toBe('User expected path');
    expect(log.executions[0].tasks[0].hitBy?.context?.xpath).toBe(inputXpath);
    await agent.aiKeyboardPress('The search input box', {
      keyName: 'Enter',
      xpath: inputXpath,
    });
    await sleep(2000);
    const log1 = await agent._unstableLogContent();
    expect(log1.executions[1].tasks[0].hitBy?.from).toBe('User expected path');
    expect(log1.executions[1].tasks[0].hitBy?.context?.xpath).toBe(inputXpath);
    await agent.aiTap('The search result link for "midscene" project');
    const log2 = await agent._unstableLogContent();
    expect(log2.executions[2].tasks[0].hitBy?.from).toBe(undefined); // AI model
    await sleep(2000);
    await agent.aiAssert('the page is "midscene github"');
  });
});
