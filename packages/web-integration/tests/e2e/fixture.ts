import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '../../src';
import { PlaywrightAiFixture } from '../../src';

export const test = base.extend<PlayWrightAiFixtureType>(PlaywrightAiFixture());
