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

  it('Sauce Demo, agent with yaml script', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);
    await sleep(3000);
    const { result } = await agent.runYaml(
      `
tasks:
  - name: search weather
    flow:
      - ai: input 'weather today' in input box, click search button
      - sleep: 3000

  - name: query weather
    flow:
      - aiQuery: "the result shows the weather info, {description: string}"
        name: weather
`,
    );

    expect(result.weather.description).toBeDefined();
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
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);
    const { result } = await agent.runYaml(
      `
tasks:
  - name: search weather
    flow:
      - ai: input 'weather today' in input box, press Enter
      - sleep: 3000

  - name: query weather
    flow:
      - aiQuery: "the result shows the weather info, {description: string}"
        name: weather

  - name: error
    continueOnError: true
    flow:
      - aiAssert: the result shows food delivery service
  `,
    );

    expect(result.weather.description).toBeDefined();
  });
});
