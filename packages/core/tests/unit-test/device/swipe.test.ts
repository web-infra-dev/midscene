import { ActionSwipeParamSchema, normalizeMobileSwipeParam } from '@/device';
import type { LocateResultElement } from '@/types';
import { describe, expect, it } from 'vitest';

const screenSize = { width: 1000, height: 800 };

const locatedAt = (x: number, y: number): LocateResultElement =>
  ({
    center: [x, y],
  }) as LocateResultElement;

describe('ActionSwipeParamSchema', () => {
  it.each([
    {
      name: 'negative distance',
      param: { distance: -100, direction: 'right' },
    },
    {
      name: 'zero distance',
      param: { distance: 0, direction: 'right' },
    },
    {
      name: 'negative duration',
      param: { end: { prompt: 'right edge' }, duration: -1 },
    },
    {
      name: 'non-finite duration',
      param: {
        end: { prompt: 'right edge' },
        duration: Number.POSITIVE_INFINITY,
      },
    },
    {
      name: 'negative repeat',
      param: { end: { prompt: 'right edge' }, repeat: -1 },
    },
    {
      name: 'fractional repeat',
      param: { end: { prompt: 'right edge' }, repeat: 1.5 },
    },
    {
      name: 'non-finite repeat',
      param: {
        end: { prompt: 'right edge' },
        repeat: Number.POSITIVE_INFINITY,
      },
    },
  ])('rejects $name', ({ param }) => {
    expect(ActionSwipeParamSchema.safeParse(param).success).toBe(false);
  });

  it('accepts distance with direction and a non-negative integer repeat', () => {
    expect(
      ActionSwipeParamSchema.safeParse({
        distance: 100,
        direction: 'right',
        repeat: 0,
      }).success,
    ).toBe(true);
  });
});

describe('normalizeMobileSwipeParam', () => {
  it('normalizes a valid relative swipe', () => {
    expect(
      normalizeMobileSwipeParam(
        {
          start: locatedAt(500, 400),
          distance: 100,
          direction: 'right',
          duration: 200,
          repeat: 2,
        },
        screenSize,
      ),
    ).toEqual({
      startPoint: { x: 500, y: 400 },
      endPoint: { x: 600, y: 400 },
      duration: 200,
      repeatCount: 2,
    });
  });

  it.each([
    {
      name: 'negative distance',
      param: { distance: -100, direction: 'right' as const },
      message: 'distance must be a positive finite number',
    },
    {
      name: 'zero distance',
      param: { distance: 0, direction: 'right' as const },
      message: 'distance must be a positive finite number',
    },
    {
      name: 'non-finite distance',
      param: {
        distance: Number.POSITIVE_INFINITY,
        direction: 'right' as const,
      },
      message: 'distance must be a positive finite number',
    },
    {
      name: 'missing direction',
      param: { distance: 100 },
      message: 'direction is required when using distance',
    },
    {
      name: 'negative duration',
      param: { end: locatedAt(600, 400), duration: -1 },
      message: 'duration must be a positive finite number',
    },
    {
      name: 'non-finite duration',
      param: {
        end: locatedAt(600, 400),
        duration: Number.POSITIVE_INFINITY,
      },
      message: 'duration must be a positive finite number',
    },
    {
      name: 'negative repeat',
      param: { end: locatedAt(600, 400), repeat: -1 },
      message: 'repeat must be a non-negative finite integer',
    },
    {
      name: 'fractional repeat',
      param: { end: locatedAt(600, 400), repeat: 1.5 },
      message: 'repeat must be a non-negative finite integer',
    },
    {
      name: 'non-finite repeat',
      param: {
        end: locatedAt(600, 400),
        repeat: Number.POSITIVE_INFINITY,
      },
      message: 'repeat must be a non-negative finite integer',
    },
  ])('rejects $name', ({ param, message }) => {
    expect(() => normalizeMobileSwipeParam(param, screenSize)).toThrow(message);
  });

  it('rejects end and distance together', () => {
    expect(() =>
      normalizeMobileSwipeParam(
        {
          end: locatedAt(600, 400),
          distance: 100,
          direction: 'right',
        },
        screenSize,
      ),
    ).toThrow('end and distance are mutually exclusive');
  });

  it('keeps zero repeat as the capped continuous mode', () => {
    expect(
      normalizeMobileSwipeParam(
        {
          end: locatedAt(600, 400),
          repeat: 0,
        },
        screenSize,
      ).repeatCount,
    ).toBe(10);
  });
});
