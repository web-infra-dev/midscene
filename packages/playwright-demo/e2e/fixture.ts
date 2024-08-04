import type { PlayWrightAiFixtureType } from '@midscene/web';
import { PlaywrightAiFixture } from '@midscene/web';
import { test as base } from '@playwright/test';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture());
