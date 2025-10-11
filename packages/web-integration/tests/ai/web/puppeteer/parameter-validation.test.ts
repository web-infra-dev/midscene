import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('parameter validation', () => {
  let resetFn: () => Promise<void>;

  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('should reject invalid enum parameter values', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);

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
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);

    // Spy on the page's scrollDown method to verify default values are applied
    const scrollDownSpy = vi.spyOn(agent.page as any, 'scrollDown');

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
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);

    const inputXpath = '//*[@id="sb_form_q"]';

    // Pass custom field in locate parameter - should not trigger validation error
    await agent.aiInput('test value', 'The search input box', {
      xpath: inputXpath,
      customField: 'should-not-be-validated', // Custom field that's not in schema
      anotherCustomField: 12345, // Another custom field
    } as any);

    // If execution reaches here without throwing error, it means locatorField wasn't validated
    const log = await agent._unstableLogContent();
    expect(log.executions.length).toBeGreaterThan(0);
    expect(log.executions[0].tasks[0].hitBy?.from).toBe('User expected path');
  });

  it('should reject invalid type for parameters', async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);

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
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage);

    // Try to call Input action without required 'value' field
    await expect(
      agent.callActionInActionSpace('Input', {
        locate: undefined,
        // Missing required 'value' field
      }),
    ).rejects.toThrow(/Invalid parameters for action Input/);
  });
});
