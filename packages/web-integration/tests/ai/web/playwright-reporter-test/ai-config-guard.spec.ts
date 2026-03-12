import { test } from '@playwright/test';
import { hasAiModelConfig } from '../../../../../../scripts/ai-test-config';

test.skip(
  hasAiModelConfig(),
  'Guard spec only runs when model config is missing',
);

test('skips AI Playwright report tests when model config is unavailable', async () => {});
