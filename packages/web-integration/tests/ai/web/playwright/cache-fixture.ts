import type { PlayWrightAiFixtureType } from '@/playwright/ai-fixture';
import { PlaywrightAiFixture } from '@/playwright/ai-fixture';
import { test as base } from '@playwright/test';

export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    waitForNetworkIdleTimeout: 10000,
    cache: { id: 'playwright-cache-test', strategy: 'read-only' },
    // cache: true
  }),
);
