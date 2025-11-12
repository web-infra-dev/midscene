/**
 * Remote Browser - AI Integration tests
 * Tests actual AI functionality like aiAction, aiAssert, aiInput, aiQuery, and YAML scripts
 * Following the same pattern as puppeteer/agent.test.ts
 */

import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchRemoteBrowser, logVncUrl } from './utils';

vi.setConfig({
  testTimeout: 600 * 1000, // 10 minutes timeout for AI tests
});

describe('Remote Browser - AI Integration', () => {
  let resetFn: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (resetFn) {
      await resetFn();
      resetFn = null;
    }
  });

  it('input and clear text', async () => {
    const { agent, page, vncUrl, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-input-related-test',
    });
    resetFn = reset;
    logVncUrl(vncUrl);

    // Navigate to Google
    await page.goto('https://www.google.com/');

    // Test aiAction for input
    await agent.aiAction('Enter "happy birthday" in search input box');
    await agent.aiAssert(
      'the text in the input box starts with "happy birthday"',
    );

    // Test aiInput with two parameters
    await agent.aiInput('Jay Chou', 'search input box');
    await agent.aiAssert('the text in the input box contains "Jay Chou"');

    // Test aiInput with options object
    await agent.aiInput('search input box', {
      value: 'Mayday',
    });
    await agent.aiAssert('the text in the input box contains "Mayday"');

    // Test aiInput with YAML
    await agent.runYaml(`
tasks:
  - name: input
    flow:
      - aiInput: 'weather today'
        locate: 'search input box'
      - aiAssert: 'the text in the input box is "weather today"'
      - aiInput: 'search input box'
        value: 'weather tomorrow'
      - aiAssert: 'the text in the input box is "weather tomorrow"'
      - aiInput:
        locate: 'search input box'
        value: 'Amazon'
      - aiAssert: 'the text in the input box is "Amazon"'
    `);
  });

  it('agent with yaml script', async () => {
    const { agent, page, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-agent-with-yaml-script',
    });
    resetFn = reset;

    // Navigate to Bing
    await page.goto('https://www.bing.com/');
    await sleep(3000);

    const { result } = await agent.runYaml(`
tasks:
  - name: search weather
    flow:
      - ai: input 'weather today' in input box, press Enter, wait for 3000ms, click the first result
      - sleep: 3000

  - name: result page
    flow:
      - aiQuery: "this is a search result page about weather. Return in this format: {answer: boolean}"
        name: weather
  `);

    expect(result.weather.answer).toBeDefined();
  });

  it('multiple style of aiInput', async () => {
    const { agent, page, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-multiple-style-of-aiInput',
    });
    resetFn = reset;

    // Navigate to Bing
    await page.goto('https://www.bing.com/');

    // Test aiInput with options first parameter
    await agent.aiInput('input box', {
      value: 'weather today',
    });
    await agent.aiAssert('the text in the input box is "weather today"');

    // Test aiInput with value and locate parameters
    await agent.aiInput('food service', 'input box for search');
    await agent.aiAssert('the text in the input box is "food service"');
  });

  it('assertion failed', async () => {
    const { agent, page, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-assertion-failed',
    });
    resetFn = reset;

    // Navigate to Bing
    await page.goto('https://www.bing.com/');

    let errorMsg = '';
    try {
      await agent.runYaml(`
tasks:
- name: search weather
  flow:
    - aiAssert: the result shows food delivery service
      `);
    } catch (e: any) {
      errorMsg = e.message;
    }

    const multiLineErrorMsg = errorMsg.split('\n');
    expect(multiLineErrorMsg.length).toBeGreaterThan(2);
  });

  it('allow error in flow', async () => {
    const { agent, page, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-allow-error-in-flow',
    });
    resetFn = reset;

    // Navigate to Baidu
    await page.goto('https://www.baidu.com');

    const { result } = await agent.runYaml(`
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
    `);

    expect(result.pageLoaded).toBeDefined();
  });

  it('drag and drop', async () => {
    const { agent, page, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-drag-and-drop',
    });
    resetFn = reset;

    // Navigate to drag and drop test page
    await page.goto('https://the-internet.herokuapp.com/drag_and_drop');

    // Perform drag and drop
    await agent.aiAction('drag the element A to B');
    await agent.aiAssert('the element A is on the right of the element B');
  });

  it('aiQuery with complex result', async () => {
    const { agent, page, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-ai-query',
    });
    resetFn = reset;

    // Navigate to a page
    await page.goto('https://www.baidu.com');

    // Perform AI query
    const result = await agent.aiQuery(
      'What is the main search engine name on this page? Return in format: {name: string}',
    );

    expect(result).toBeTruthy();
    expect(result.name).toBeTruthy();
    // Check for either English or Chinese name
    const nameLower = result.name.toLowerCase();
    expect(nameLower.includes('baidu') || result.name.includes('百度')).toBe(
      true,
    );
  });

  it('open new tab', async () => {
    const { agent, page, reset } = await launchRemoteBrowser({
      cacheId: 'remote-browser-open-new-tab',
    });
    resetFn = reset;

    // Navigate to Bing
    await page.goto('https://www.bing.com/');

    // Use aiInput with xpath
    const inputXpath = '//*[@id="sb_form_q"]';
    await agent.aiInput('midscene github', 'The search input box', {
      xpath: inputXpath,
    });

    // Get log content to verify xpath was used
    const log = await agent._unstableLogContent();
    expect(log.executions[0].tasks[0].hitBy?.from).toBe('User expected path');
    expect(log.executions[0].tasks[0].hitBy?.context?.xpath).toBe(inputXpath);

    // Press Enter key
    await agent.aiKeyboardPress('Enter', 'The search input box', {
      xpath: inputXpath,
    });
    await sleep(5000);

    const log1 = await agent._unstableLogContent();
    expect(log1.executions[1].tasks[0].hitBy?.from).toBe('User expected path');
    expect(log1.executions[1].tasks[0].hitBy?.context?.xpath).toBe(inputXpath);

    // Click on search result
    await agent.aiTap('The search result link for "midscene" project');
    const log2 = await agent._unstableLogContent();
    expect(log2.executions[2].tasks[0].hitBy?.from).toBe('AI model');

    await sleep(5000);
    await agent.aiAssert('the page is about "midscene" project');
  });
});
