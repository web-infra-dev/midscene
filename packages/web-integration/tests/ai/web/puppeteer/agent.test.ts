import { platform } from 'node:os';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('puppeteer integration', () => {
  let resetFn: () => Promise<void>;
  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('input and clear text', async () => {
    const { originPage, reset } = await launchPage('https://www.google.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);
    await agent.aiAction(
      'Enter "happy birthday" , sleep 100ms, delete all text in the input box',
    );
  });

  it.only('agent with yaml script', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);
    await sleep(3000);
    const { result } = await agent.runYaml(
      `
  tasks:
    - name: search weather
      flow:
        - ai: input 'weather today' in input box, press Enter
        - sleep: 3000

    - name: result page
      flow:
        - aiQuery: "this is a search result page about weather. Return in this format: {answer: boolean}"
          name: weather
  `,
    );

    expect(result.weather.answer).toBeDefined();
  });

  it('assertion failed', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);
    let errorMsg = '';
    try {
      await agent.runYaml(
        `
    tasks:
    - name: search weather
      flow:
        - aiAssert: the result shows food delivery service
          `,
      );
    } catch (e: any) {
      errorMsg = e.message;
    }

    const multiLineErrorMsg = errorMsg.split('\n');
    expect(multiLineErrorMsg.length).toBeGreaterThan(2);
  });

  it('allow error in flow', async () => {
    const { originPage, reset } = await launchPage(
      platform() === 'darwin'
        ? 'https://www.baidu.com'
        : 'https://www.bing.com/',
    );
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);
    const { result } = await agent.runYaml(
      `
  tasks:
    - name: search weather
      flow:
        - ai: input 'weather today' in input box, click search button
        - sleep: 3000

    - name: error
      continueOnError: true
      flow:
        - aiAssert: the result shows food delivery service

    - name: result page
      continueOnError: true
      flow:
        - aiQuery: "this is a search result, use this format to answer: {result: boolean}"
          name: pageLoaded
    `,
    );

    expect(result.pageLoaded).toBeDefined();
  });
});
