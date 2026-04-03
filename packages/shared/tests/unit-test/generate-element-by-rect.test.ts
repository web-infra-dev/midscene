import { describe, expect, it } from 'vitest';
import { generateElementByRect } from '../../src/extractor/dom-util';

describe('generateElementByRect', () => {
  it('calculates center for even-sized rects and preserves sourceRect', () => {
    const sourceRect = { left: 10, top: 20, width: 6, height: 6 };

    const result = generateElementByRect(sourceRect, 'test element');

    expect(result.center).toEqual([12, 22]);
    expect(result.rect).toEqual(sourceRect);
    expect(result.description).toBe('test element');
  });

  it('calculates center for odd-sized rects and preserves sourceRect', () => {
    const sourceRect = { left: 10, top: 20, width: 5, height: 5 };

    const result = generateElementByRect(sourceRect, '');

    expect(result.center).toEqual([12, 22]);
    expect(result.rect).toEqual(sourceRect);
    expect(result.description).toBe('');
  });
});
