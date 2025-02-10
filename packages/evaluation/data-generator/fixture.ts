import type { PlayWrightAiFixtureType } from '@midscene/web';
import { PlaywrightAiFixture } from '@midscene/web/playwright';
import { test as base } from '@playwright/test';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture());
