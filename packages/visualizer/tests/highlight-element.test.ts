import { describe, expect, it } from '@rstest/core';
import { getCenterHighlightBox } from '../src/utils/highlight-element';

describe('getCenterHighlightBox', () => {
  it.each([
    [100, 200],
    [1, 2],
    [0, 0],
    [12.25, 25.75],
  ])('preserves the exact target at %j', (x, y) => {
    const box = getCenterHighlightBox({ center: [x, y] });
    expect(box.left + box.width / 2).toBe(x);
    expect(box.top + box.height / 2).toBe(y);
    expect(box.width).toBe(8);
    expect(box.height).toBe(8);
  });
});
