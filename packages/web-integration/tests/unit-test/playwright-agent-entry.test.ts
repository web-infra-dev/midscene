import * as agentEntry from '@/playwright/agent';
import * as playwrightEntry from '@/playwright/index';
import { describe, expect, it } from '@rstest/core';

describe('Playwright Agent entry', () => {
  it('preserves the Agent exports of the original Playwright entry', () => {
    for (const name of [
      'PlaywrightAgent',
      'PlaywrightPageAgent',
      'PlaywrightBrowserAgent',
      'PlaywrightWebPage',
      'overrideAIConfig',
    ] as const) {
      expect(agentEntry[name]).toBe(playwrightEntry[name]);
    }
    expect(agentEntry.PlaywrightAgent).toBe(agentEntry.PlaywrightPageAgent);
  });

  it('keeps Playwright Test fixtures on the original entry', () => {
    expect(agentEntry).not.toHaveProperty('PlaywrightAiFixture');
    const fixture = playwrightEntry.PlaywrightAiFixture();
    expect(fixture.aiAct).toBeInstanceOf(Function);
    expect(fixture.agentForPage).toBeInstanceOf(Function);
  });
});
