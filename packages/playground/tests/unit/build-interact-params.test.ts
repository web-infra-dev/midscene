import { describe, expect, it } from 'vitest';
import { buildInteractParams, pointToLocateResult } from '../../src/server';

describe('pointToLocateResult', () => {
  it('rounds and clamps coordinates and produces a small rect', () => {
    const result = pointToLocateResult(123.4, 456.6, 'manual');
    expect(result.center).toEqual([123, 457]);
    expect(result.description).toBe('manual');
    expect(result.rect.width).toBe(8);
    expect(result.rect.height).toBe(8);
    expect(result.rect.left).toBeGreaterThanOrEqual(0);
    expect(result.rect.top).toBeGreaterThanOrEqual(0);
  });

  it('clamps a near-zero point to a non-negative rect origin', () => {
    const result = pointToLocateResult(2, 1, 'edge');
    expect(result.rect.left).toBe(0);
    expect(result.rect.top).toBe(0);
  });

  it('throws when x or y is missing or non-numeric', () => {
    expect(() => pointToLocateResult(undefined, 5, 'x')).toThrow();
    expect(() => pointToLocateResult(5, undefined, 'x')).toThrow();
    expect(() => pointToLocateResult('5', 5, 'x' as string)).toThrow();
  });
});

describe('buildInteractParams', () => {
  it('Tap wraps {x,y} into a locate element', () => {
    const params = buildInteractParams('Tap', { x: 100, y: 200 });
    expect(params.locate).toMatchObject({ center: [100, 200] });
  });

  it.each(['Tap', 'DoubleClick', 'RightClick', 'Hover', 'LongPress'])(
    '%s uses {x,y} as locate and forwards optional duration',
    (actionType) => {
      const params = buildInteractParams(actionType, {
        x: 10,
        y: 20,
        duration: 350,
      });
      expect(params.locate).toMatchObject({ center: [10, 20] });
      expect(params.duration).toBe(350);
    },
  );

  it('Swipe builds start/end locate elements and forwards duration & repeat', () => {
    const params = buildInteractParams('Swipe', {
      x: 10,
      y: 20,
      endX: 110,
      endY: 220,
      duration: 500,
      repeat: 2,
    });
    expect(params).toMatchObject({
      start: { center: [10, 20] },
      end: { center: [110, 220] },
      duration: 500,
      repeat: 2,
    });
  });

  it('DragAndDrop maps to {from,to} pair', () => {
    const params = buildInteractParams('DragAndDrop', {
      x: 1,
      y: 2,
      endX: 3,
      endY: 4,
    });
    expect(params).toMatchObject({
      from: { center: [1, 2] },
      to: { center: [3, 4] },
    });
  });

  it('KeyboardPress requires keyName and passes it through', () => {
    expect(buildInteractParams('KeyboardPress', { keyName: 'Enter' })).toEqual({
      keyName: 'Enter',
    });
    expect(() => buildInteractParams('KeyboardPress', {})).toThrow();
  });

  it('Input requires value and accepts optional locate / mode flags', () => {
    expect(
      buildInteractParams('Input', {
        value: 'hello',
        x: 50,
        y: 60,
        mode: 'replace',
        autoDismissKeyboard: true,
      }),
    ).toMatchObject({
      value: 'hello',
      locate: { center: [50, 60] },
      mode: 'replace',
      autoDismissKeyboard: true,
    });
    expect(() => buildInteractParams('Input', {})).toThrow();
  });

  it('falls back to pass-through (minus actionType) for unknown actions', () => {
    const params = buildInteractParams('CustomThing', {
      foo: 1,
      bar: 'baz',
    });
    expect(params).toEqual({ foo: 1, bar: 'baz' });
    expect(params).not.toHaveProperty('actionType');
  });
});
