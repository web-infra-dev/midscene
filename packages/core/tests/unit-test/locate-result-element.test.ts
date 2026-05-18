import {
  createLocateResultElementFromPoint,
  createLocateResultElementFromRect,
} from '@/locate-result-element';
import { describe, expect, it } from 'vitest';

describe('createLocateResultElementFromRect', () => {
  it('calculates center for even-sized rects and preserves sourceRect', () => {
    const sourceRect = { left: 10, top: 20, width: 6, height: 6 };

    const result = createLocateResultElementFromRect(
      sourceRect,
      'test element',
    );

    expect(result.center).toEqual([12, 22]);
    expect(result.rect).toEqual(sourceRect);
    expect(result.description).toBe('test element');
  });

  it('calculates center for odd-sized rects and preserves sourceRect', () => {
    const sourceRect = { left: 10, top: 20, width: 5, height: 5 };

    const result = createLocateResultElementFromRect(sourceRect, '');

    expect(result.center).toEqual([12, 22]);
    expect(result.rect).toEqual(sourceRect);
    expect(result.description).toBe('');
  });
});

describe('createLocateResultElementFromPoint', () => {
  it('creates an expanded rect around the point', () => {
    const result = createLocateResultElementFromPoint([10, 20], 'target');

    expect(result.center).toEqual([10, 20]);
    expect(result.rect).toEqual({ left: 7, top: 17, width: 8, height: 8 });
    expect(result.description).toBe('target');
  });

  it('does not create negative rect positions', () => {
    const result = createLocateResultElementFromPoint([1, 2], '');

    expect(result.center).toEqual([1, 2]);
    expect(result.rect).toEqual({ left: 0, top: 0, width: 8, height: 8 });
    expect(result.description).toBe('');
  });
});
