import { normalizePlanningSwipeDistances } from '@/ai-model/workflows/planning/swipe-distance';
import type { PlanningAction } from '@/types';
import { describe, expect, it } from '@rstest/core';

describe('planning Swipe distance boundary', () => {
  it('preserves endpoints, other actions, duration and the raw model parameter object', () => {
    const param = { direction: 'up', distance: 90, duration: 500 };
    const endpoint = {
      start: { center: [120, 240] },
      end: { center: [120, 150] },
    };
    const actions = [
      { type: 'Swipe', param },
      { type: 'Swipe', param: endpoint },
      { type: 'Scroll', param },
      { type: 'CustomMovement', param },
    ] as PlanningAction[];
    normalizePlanningSwipeDistances(actions, 3);
    expect(actions[0].param).toEqual({ ...param, distance: 30 });
    expect(param.distance).toBe(90);
    expect(actions[1].param).toBe(endpoint);
    expect(actions[2].param).toBe(param);
    expect(actions[3].param).toBe(param);
  });
  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid ratio %s before a planned relative swipe can execute',
    (ratio) => {
      expect(() =>
        normalizePlanningSwipeDistances(
          [{ type: 'Swipe', param: { distance: 90 } }],
          ratio as number,
        ),
      ).toThrow('Invalid screenshot-to-logical ratio');
    },
  );
});
