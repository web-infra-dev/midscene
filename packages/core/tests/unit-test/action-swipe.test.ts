import { parseActionParam } from '@/ai-model';
import { ActionSwipeParamSchema, normalizeMobileSwipeParam } from '@/device';
import { describe, expect, it } from '@rstest/core';

describe('Swipe Action Parameter Validation', () => {
  const screenSize = { width: 400, height: 800 };
  const endpoint = {
    description: 'swipe endpoint',
    center: [100, 200] as [number, number],
  };

  describe('ActionSwipeParamSchema', () => {
    it('accepts a positive distance', () => {
      const parsed = parseActionParam(
        { direction: 'up', distance: 200 },
        ActionSwipeParamSchema,
      );

      expect(parsed).toEqual({
        direction: 'up',
        distance: 200,
        duration: 300,
      });
    });

    it('rejects a non-positive distance', () => {
      expect(() =>
        parseActionParam(
          { direction: 'up', distance: 0 },
          ActionSwipeParamSchema,
        ),
      ).toThrow();
      expect(() =>
        parseActionParam(
          { direction: 'up', distance: -100 },
          ActionSwipeParamSchema,
        ),
      ).toThrow();
    });
  });

  describe('normalizeMobileSwipeParam', () => {
    it('uses the screen center when an endpoint swipe omits start', () => {
      const result = normalizeMobileSwipeParam({ end: endpoint }, screenSize);

      expect(result.startPoint).toEqual({ x: 200, y: 400 });
      expect(result.endPoint).toEqual({ x: 100, y: 200 });
    });

    it('normalizes a relative swipe with a positive distance', () => {
      const result = normalizeMobileSwipeParam(
        { direction: 'up', distance: 150 },
        screenSize,
      );

      expect(result.startPoint).toEqual({ x: 200, y: 400 });
      expect(result.endPoint).toEqual({ x: 200, y: 250 });
    });

    it('rejects combining end with direction', () => {
      expect(() =>
        normalizeMobileSwipeParam(
          {
            end: endpoint,
            direction: 'up',
          },
          screenSize,
        ),
      ).toThrow(/"end" cannot be combined/);
    });

    it('rejects combining end with distance', () => {
      expect(() =>
        normalizeMobileSwipeParam(
          {
            end: endpoint,
            distance: 150,
          },
          screenSize,
        ),
      ).toThrow(/"end" cannot be combined/);
    });

    it('rejects an incomplete relative swipe', () => {
      expect(() =>
        normalizeMobileSwipeParam({ direction: 'up' }, screenSize),
      ).toThrow(/requires both "direction" and a positive "distance"/);
      expect(() =>
        normalizeMobileSwipeParam({ distance: 150 }, screenSize),
      ).toThrow(/requires both "direction" and a positive "distance"/);
    });

    it('rejects a non-positive distance when called directly', () => {
      expect(() =>
        normalizeMobileSwipeParam({ direction: 'up', distance: 0 }, screenSize),
      ).toThrow(/"distance" must be a positive number/);
      expect(() =>
        normalizeMobileSwipeParam(
          { direction: 'up', distance: -100 },
          screenSize,
        ),
      ).toThrow(/"distance" must be a positive number/);
    });
  });
});
