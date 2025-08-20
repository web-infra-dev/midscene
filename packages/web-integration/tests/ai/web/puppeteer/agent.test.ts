import { platform } from 'node:os';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 600 * 1000,
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
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'input-related-test',
    });

    await agent.aiAction('Enter "happy birthday" in search input box');
    await agent.aiAssert(
      'the text in the input box starts with "happy birthday"',
    );

    await agent.aiInput('Jay Chou', 'search input box');
    await agent.aiAssert('the text in the input box contains "Jay Chou"');

    await agent.aiInput('search input box', {
      value: 'Mayday',
    });
    await agent.aiAssert('the text in the input box contains "Mayday"');

    await agent.runYaml(
      `
    tasks:
      - name: input
        flow:
          - aiInput: 'weather today'
            locate: 'search input box'
          - aiAssert: 'the text in the input box is "weather today"'
          - aiInput: 'search input box'
            value: 'weather tomorrow'
          - aiAssert: 'the text in the input box is "weather tomorrow"'
    `,
    );
  });

  it('agent with yaml script', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'test-agent-with-yaml-script',
    });
    await sleep(3000);
    const { result } = await agent.runYaml(
      `
  tasks:
    - name: search weather
      flow:
        - ai: input 'weather today' in input box, press Enter, wait for 3000ms, click the first result
        - sleep: 3000

    - name: result page
      flow:
        - aiQuery: "this is a search result page about weather. Return in this format: {answer: boolean}"
          name: weather
  `,
    );

    expect(result.weather.answer).toBeDefined();
  });

  it('multiple style of aiInput', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'test-multiple-style-of-aiInput',
    });
    await agent.aiInput('input box', {
      value: 'weather today',
    });
    await agent.aiAssert('the text in the input box is "weather today"');
    await agent.aiInput('food service', 'input box for search');
    await agent.aiAssert('the text in the input box is "food service"');
  });

  it('assertion failed', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'test-assertion-failed',
    });
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
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'test-allow-error-in-flow',
    });
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
