import { describe, expect, it } from '@rstest/core';
import { formatTimestamp } from './view-primitives';

describe('test runner view primitives', () => {
  it('formats report timestamps without locale-specific date characters', () => {
    const timestamp = formatTimestamp('2026-09-18T14:29:25.000Z');

    expect(timestamp).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(timestamp).not.toMatch(/[年月日]/);
  });
});
