import { isOpenRouter } from '@/ai-model/model-adapter/is-openrouter';
import { describe, expect, it } from '@rstest/core';

describe('OpenRouter endpoint detection', () => {
  it('recognizes the supported endpoint', () => {
    expect(isOpenRouter('https://openrouter.ai/api/v1')).toBe(true);
  });

  it.each([
    undefined,
    '',
    'http://openrouter.ai/api/v1',
    'https://openrouter.ai/api/v1/',
    'https://openrouter.ai/api/v2',
    'https://openrouter.ai',
    'https://proxy.example.com/api/v1',
  ])('does not apply OpenRouter mappings for %s', (baseURL) => {
    expect(isOpenRouter(baseURL)).toBe(false);
  });
});
