import { describe, expect, it } from '@rstest/core';
import { resolveSwipeSpeed } from '../../src/swipe';

describe('resolveSwipeSpeed', () => {
  it('converts duration to speed based on two-dimensional distance', () => {
    expect(resolveSwipeSpeed({ x: 0, y: 0 }, { x: 300, y: 400 }, 1000)).toBe(
      500,
    );
  });

  it('uses the default 300ms duration', () => {
    expect(resolveSwipeSpeed({ x: 100, y: 100 }, { x: 400, y: 100 })).toBe(
      1000,
    );
  });

  it('produces a lower speed for a longer duration', () => {
    const shortDurationSpeed = resolveSwipeSpeed(
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      300,
    );
    const longDurationSpeed = resolveSwipeSpeed(
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      1000,
    );

    expect(shortDurationSpeed).toBe(2000);
    expect(longDurationSpeed).toBe(600);
    expect(longDurationSpeed).toBeLessThan(shortDurationSpeed);
  });

  it.each([
    { duration: 10000, expectedSpeed: 200 },
    { duration: 1, expectedSpeed: 40000 },
  ])(
    'clamps speed to HDC limits for duration $duration',
    ({ duration, expectedSpeed }) => {
      expect(
        resolveSwipeSpeed({ x: 0, y: 0 }, { x: 1000, y: 0 }, duration),
      ).toBe(expectedSpeed);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid duration %s',
    (duration) => {
      expect(() =>
        resolveSwipeSpeed({ x: 0, y: 0 }, { x: 100, y: 0 }, duration),
      ).toThrow('Harmony swipe duration must be a positive finite number');
    },
  );
});
