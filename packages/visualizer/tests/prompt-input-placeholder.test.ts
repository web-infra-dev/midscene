import { describe, expect, it } from 'vitest';
import { getPlaceholderForType } from '../src/utils/prompt-placeholder';

describe('getPlaceholderForType', () => {
  it('returns API-specific prompt placeholders', () => {
    expect(getPlaceholderForType('aiTap')).toBe(
      'What element do you want to tap?',
    );
    expect(getPlaceholderForType('aiQuery')).toBe('What do you want to query?');
    expect(getPlaceholderForType('aiAssert')).toBe(
      'What do you want to assert?',
    );
  });
});
