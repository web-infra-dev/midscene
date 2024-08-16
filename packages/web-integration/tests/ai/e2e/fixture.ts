import type { PlayWrightAiFixtureType } from '@/index';
import { PlaywrightAiFixture } from '@/index';
import { test as base } from '@playwright/test';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture());
