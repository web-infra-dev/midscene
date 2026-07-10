import { describe, expect, it } from 'vitest';
import { isTextTruncated } from '../src/hooks/useTextTruncation';

describe('isTextTruncated', () => {
  it('detects content hidden by a two-line clamp', () => {
    expect(
      isTextTruncated(
        {
          clientHeight: 44,
          clientWidth: 200,
          scrollHeight: 66,
          scrollWidth: 200,
        },
        'multi-line',
      ),
    ).toBe(true);
  });

  it('ignores horizontal overflow when a two-line clamp still fits', () => {
    expect(
      isTextTruncated(
        {
          clientHeight: 44,
          clientWidth: 200,
          scrollHeight: 44,
          scrollWidth: 240,
        },
        'multi-line',
      ),
    ).toBe(false);
  });

  it('detects horizontal overflow for single-line ellipsis', () => {
    expect(
      isTextTruncated(
        {
          clientHeight: 20,
          clientWidth: 200,
          scrollHeight: 20,
          scrollWidth: 240,
        },
        'single-line',
      ),
    ).toBe(true);
  });
});
