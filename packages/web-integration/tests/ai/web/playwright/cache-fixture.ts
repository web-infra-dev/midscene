import type { PlayWrightAiFixtureType } from '@/playwright/ai-fixture';
import { PlaywrightAiFixture } from '@/playwright/ai-fixture';
import { test as base } from '@playwright/test';

export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    waitForNetworkIdleTimeout: 10000,
    // Use read-write strategy to allow cache creation in CI environment
    // where cache files don't exist initially
    cache: { id: 'playwright-cache-test', strategy: 'read-write' },
  }),
);
