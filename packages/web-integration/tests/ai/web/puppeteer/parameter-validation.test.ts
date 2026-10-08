import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import type { Page } from 'puppeteer';
import { launchPage } from './utils';

rs.setConfig({
  testTimeout: 120 * 1000,
});

describe('parameter validation', () => {
  let resetFn: () => Promise<void>;
  let originPage: Page;
  let agent: PuppeteerAgent;

  beforeEach(async () => {
    const launched = await launchPage('about:blank');
    resetFn = launched.reset;
    originPage = launched.originPage;
    await originPage.setContent(`
      <!doctype html>
      <html>
        <body style="min-height: 2000px">
          <label for="search-input">Search</label>
          <input id="search-input" type="text" style="width: 300px; padding: 10px" />
        </body>
      </html>
    `);
    // Parameter validation and explicit XPath lookup do not need a model call.
    agent = new PuppeteerAgent(originPage, {
      generateReport: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'parameter-validation-test',
        MIDSCENE_MODEL_API_KEY: 'test-key',
        MIDSCENE_MODEL_BASE_URL: 'https://model.invalid/v1',
        MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl',
      },
    });
  });

  afterEach(async () => {
    try {
      await agent?.destroy();
    } finally {
      await resetFn?.();
    }
  });

  it('should reject invalid enum parameter values', async () => {
    // Try to call aiScroll with invalid direction value
    await expect(
      agent.callActionInActionSpace('Scroll', {
        direction: 'invalid-direction' as any, // Invalid enum value
        scrollType: 'once',
        locate: undefined,
      }),
    ).rejects.toThrow(/Invalid parameters for action Scroll/);
  });

  it('should apply default values from paramSchema', async () => {
    // Spy on the page's scrollDown method to verify default values are applied
    const scrollDownSpy = rs.spyOn(agent.page as any, 'scrollDown');

    // Call Scroll action via callActionInActionSpace without optional direction/scrollType
    // The parseActionParam should apply defaults: direction='down', scrollType='once'
    await agent.callActionInActionSpace('Scroll', {
      // Not providing direction or scrollType - should use defaults from paramSchema
      // locate is optional for Scroll action, so we don't provide it
    });

    // Verify scrollDown was called (which means direction='down' default was applied)
    expect(scrollDownSpy).toHaveBeenCalled();
  });

  it('should preserve locator fields without validation', async () => {
    const inputXpath = '//*[@id="search-input"]';
    const locate = {
      prompt: 'The search input box',
      xpath: inputXpath,
      customField: 'should-not-be-validated', // Custom field that's not in schema
      anotherCustomField: 12345, // Another custom field
    };

    await agent.callActionInActionSpace('Input', {
      value: 'test value',
      locate,
    });

    const log = await agent._unstableLogContent();
    expect(log.executions).toHaveLength(1);
    const locateTask = log.executions[0].tasks.find(
      (task) => task.type === 'Planning' && task.subType === 'Locate',
    );
    expect(locateTask?.param).toMatchObject(locate);
    expect(locateTask?.hitBy).toEqual({
      from: 'User expected path',
      context: { xpath: inputXpath },
    });
    expect(
      await originPage.$eval(
        '#search-input',
        (element) => (element as HTMLInputElement).value,
      ),
    ).toBe('test value');
  });

  it('should preserve xpath through aiInput', async () => {
    const inputXpath = '//*[@id="search-input"]';
    await agent.aiInput('The search input box', {
      value: 'test value',
      xpath: inputXpath,
    });

    const log = await agent._unstableLogContent();
    expect(log.executions).toHaveLength(1);
    const locateTask = log.executions[0].tasks.find(
      (task) => task.type === 'Planning' && task.subType === 'Locate',
    );
    expect(locateTask?.hitBy).toEqual({
      from: 'User expected path',
      context: { xpath: inputXpath },
    });
    expect(
      await originPage.$eval(
        '#search-input',
        (element) => (element as HTMLInputElement).value,
      ),
    ).toBe('test value');
  });

  it('should reject invalid type for parameters', async () => {
    // Try to call Scroll with distance as a string instead of number
    await expect(
      agent.callActionInActionSpace('Scroll', {
        direction: 'down',
        scrollType: 'once',
        distance: 'invalid-number' as any, // Should be number, not string
        locate: undefined,
      }),
    ).rejects.toThrow(/Invalid parameters for action Scroll/);
  });

  it('should validate required parameters are present', async () => {
    // Try to call Input action without required 'value' field
    await expect(
      agent.callActionInActionSpace('Input', {
        locate: undefined,
        // Missing required 'value' field
      }),
    ).rejects.toThrow(/Invalid parameters for action Input/);
  });
});
