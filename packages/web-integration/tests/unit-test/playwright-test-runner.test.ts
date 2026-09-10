import { describe, expect, it } from '@rstest/core';
import type { Page } from 'playwright';
import { PlaywrightBrowserAgent } from '../../src/playwright/browser-agent';
import { PlaywrightPageAgent } from '../../src/playwright/page-agent';
import {
  gotoUrlInputSchema,
  playwrightAgentTestRunnerNodeDefinitions,
} from '../../src/playwright/test-runner';

describe('Playwright test runner entry', () => {
  it('exposes common and browser Nodes on both Agent classes', () => {
    for (const agentClass of [PlaywrightPageAgent, PlaywrightBrowserAgent]) {
      const names = agentClass
        .getTestRunnerNodeDefinitions()
        .map(({ name }) => name);
      expect(names).toEqual(
        expect.arrayContaining([
          'aiAct',
          'aiTap',
          'gotoUrl',
          'setCookies',
          'clearCookies',
          'setViewportSize',
        ]),
      );
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('exports platform definitions without initializing a browser', () => {
    expect(
      playwrightAgentTestRunnerNodeDefinitions.map(({ name }) => name),
    ).toEqual(['gotoUrl', 'setCookies', 'clearCookies', 'setViewportSize']);
    expect(
      gotoUrlInputSchema.parse({ url: 'https://example.com' }).waitUntil,
    ).toBe('domcontentloaded');
  });

  it('rejects agents without a Playwright page', async () => {
    await expect(
      playwrightAgentTestRunnerNodeDefinitions[0].execute(
        {},
        { url: 'https://example.com' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('must return a Playwright Agent');
  });

  it('honors cancellation before operating the page', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Run cancelled'));
    await expect(
      playwrightAgentTestRunnerNodeDefinitions[0].execute(
        { interface: { underlyingPage: {} as Page } },
        gotoUrlInputSchema.parse({ url: 'https://example.com' }),
        { signal: controller.signal },
      ),
    ).rejects.toThrow('Run cancelled');
  });
});
