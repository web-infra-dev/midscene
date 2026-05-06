import { describe, expect, test } from 'vitest';
import { calculateEmptyStatePromptScrollTop } from '../src/utils/empty-state-scroll';

describe('calculateEmptyStatePromptScrollTop', () => {
  test('scrolls just enough to reveal the empty-state body', () => {
    expect(
      calculateEmptyStatePromptScrollTop({
        currentScrollTop: 0,
        maxScrollTop: 245,
        containerTop: 60,
        containerBottom: 479,
        contentStartTop: 244,
        contentEndBottom: 540,
      }),
    ).toBe(85);
  });

  test('does not scroll past the empty-state start anchor', () => {
    expect(
      calculateEmptyStatePromptScrollTop({
        currentScrollTop: 0,
        maxScrollTop: 245,
        containerTop: 60,
        containerBottom: 360,
        contentStartTop: 130,
        contentEndBottom: 620,
      }),
    ).toBe(46);
  });
});
