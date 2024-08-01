import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web';
import { PlaywrightAiFixture } from '@midscene/web';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture());
