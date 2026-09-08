import { matchElementFromPlan } from '@/agent/utils';
import { createLocateResultCodec } from '@/ai-model/shared/model-locate-result';
import type { PixelLocateResult } from '@/ai-model/shared/model-locate-result';
import { expandSearchArea } from '@/ai-model/workflows/grounding/search-area';
import {
  mapSearchAreaPointToOriginalPoint,
  mapSearchAreaRectToOriginalRect,
  mapSearchAreaResultToOriginalResult,
} from '@/ai-model/workflows/grounding/search-area-mapping';
import { getMidsceneLocationSchema, parseActionParam } from '@/common';
import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';

const context = { preparedSize: { width: 100, height: 80 } };

describe('search-area result mapping', () => {
  it('restores a point-only result without adding rect metadata or rounding', () => {
    const result = mapSearchAreaResultToOriginalResult(
      { center: [3, 5] },
      { scale: 2, offset: { x: 10, y: 20 } },
    );
    expect(result).toEqual({ center: [11.5, 22.5] });
    expect(result).not.toHaveProperty('rect');
  });

  it('restores center and rect independently without mutating the input', () => {
    const input: PixelLocateResult = {
      center: [3, 5],
      rect: { left: 20, top: 40, width: 21, height: 41 },
    };
    const original = structuredClone(input);
    expect(
      mapSearchAreaResultToOriginalResult(input, {
        scale: 2,
        offset: { x: 100, y: 200 },
      }),
    ).toEqual({
      center: [101.5, 202.5],
      rect: { left: 110, top: 220, width: 11, height: 21 },
    });
    expect(input).toEqual(original);
  });

  it('preserves full-screenshot coordinates when no mapping is provided', () => {
    const input: PixelLocateResult = {
      center: [10.25, 20.5],
      rect: { left: 1.25, top: 2.5, width: 20, height: 30 },
    };
    const result = mapSearchAreaResultToOriginalResult(input);
    expect(result).toEqual(input);
    expect(result.center).not.toBe(input.center);
    expect(result.rect).not.toBe(input.rect);
  });
});

describe('point-based grounding', () => {
  it.each([
    [0, 0],
    [99, 79],
    [0.25, 78.75],
    [12.25, 23.75],
  ])('preserves pixel points at (%s, %s), including image edges', (x, y) => {
    const codec = createLocateResultCodec({ coordinates: { shape: 'point' } });
    expect(codec.toPixelResult([x, y], context).center).toEqual([x, y]);
  });

  it('maps normalized yx points without expanding and rounds the mapped point', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'yx', normalizedBy: 1000 },
    });
    expect(codec.toPixelResult([500, 500], context).center).toEqual([50, 40]);
    expect(codec.toPixelResult([0, 1000], context).center).toEqual([99, 0]);
  });

  it('takes the bbox midpoint before normalization and content clipping', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', normalizedBy: 1000 },
    });
    expect(codec.toPixelResult([100, 200, 300, 400], context).center).toEqual([
      20, 24,
    ]);
    expect(
      codec.toPixelResult([0, 0, 1000, 1000], {
        ...context,
        contentSize: { width: 70, height: 60 },
      }).center,
    ).toEqual([50, 40]);
  });

  it('rounds the mapped raw midpoint instead of deriving it from rounded bbox corners', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', normalizedBy: 1000 },
    });
    expect(codec.toPixelResult([0, 0, 10, 0], context)).toEqual({
      center: [0, 0],
      rect: { left: 0, top: 0, width: 2, height: 1 },
    });
  });

  it('uses the actual per-response shape for bbox models returning a point', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox' },
      parseRawLocateValue: () => ({
        coordinates: [0.25, 0.5],
        coordinatesMeta: { shape: 'point', order: 'xy' },
      }),
    });
    expect(codec.toPixelResult('fallback point', context).center).toEqual([
      0.25, 0.5,
    ]);
  });

  it('keeps subpixel precision through crop mapping and rounds once at action execution', () => {
    const center = mapSearchAreaPointToOriginalPoint([3, 5], {
      offset: { x: 10, y: 20 },
      scale: 2,
    });
    expect(center).toEqual([11.5, 22.5]);
    const raw = { locate: { center, description: 'target' } };
    const result = parseActionParam(
      raw,
      z.object({ locate: getMidsceneLocationSchema() }),
      {
        shrunkShotToLogicalRatio: 3,
      },
    );
    expect(result?.locate).toEqual({ center: [4, 8], description: 'target' });
    expect(raw.locate.center).toEqual([11.5, 22.5]);
    expect(raw.locate).not.toHaveProperty('rect');
    expect(
      parseActionParam(raw, z.object({ locate: getMidsceneLocationSchema() }), {
        shrunkShotToLogicalRatio: 1,
      })?.locate.center,
    ).toEqual([12, 23]);
  });

  it.each([
    [-1, 0],
    [100, 0],
    [0, 80],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('rejects invalid pixel points (%s, %s)', (x, y) => {
    const codec = createLocateResultCodec({ coordinates: { shape: 'point' } });
    expect(() => codec.toPixelResult([x, y], context).center).toThrow();
  });

  it('rejects reversed bbox corners', () => {
    const codec = createLocateResultCodec({ coordinates: { shape: 'bbox' } });
    expect(() => codec.toPixelResult([20, 20, 10, 30], context).center).toThrow(
      /order/,
    );
  });
});

describe('original bbox metadata', () => {
  it('keeps center independent from clipped bbox corners', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', normalizedBy: 1000 },
    });
    expect(codec.toPixelResult([100, 200, 300, 400], context)).toEqual({
      center: [20, 24],
      rect: { left: 10, top: 16, width: 21, height: 17 },
    });
    const clippedContext = {
      ...context,
      contentSize: { width: 70, height: 60 },
    };
    expect(codec.toPixelResult([0, 0, 1000, 1000], clippedContext)).toEqual({
      center: [50, 40],
      rect: { left: 0, top: 0, width: 70, height: 60 },
    });
  });

  it('ignores rect when computing action coordinates', () => {
    const result = parseActionParam(
      {
        locate: {
          center: [11.5, 22.5],
          rect: { left: 500, top: 500, width: 100, height: 100 },
          description: 'target',
        },
      },
      z.object({ locate: getMidsceneLocationSchema() }),
      { shrunkShotToLogicalRatio: 3 },
    );
    expect(result?.locate.center).toEqual([4, 8]);
  });
});

it.each([
  [200, 200, 1199, 299],
  [200, 100, 299, 849],
  [0, 0, 1599, 899],
])(
  'preserves coarse bbox %j through planning handoff and search expansion',
  (...bbox) => {
    const codec = createLocateResultCodec({ coordinates: { shape: 'bbox' } });
    const context = { preparedSize: { width: 1600, height: 900 } };
    const result = codec.toPixelResult(bbox, context);
    const element = matchElementFromPlan({
      prompt: 'target',
      locatedPixelResult: result,
    });
    const area = expandSearchArea(element!.rect!, { width: 1600, height: 900 });
    expect(area.left).toBeLessThanOrEqual(bbox[0]);
    expect(area.top).toBeLessThanOrEqual(bbox[1]);
    expect(area.left + area.width - 1).toBeGreaterThanOrEqual(bbox[2]);
    expect(area.top + area.height - 1).toBeGreaterThanOrEqual(bbox[3]);
  },
);

it('maps original rect metadata from a scaled crop independently', () => {
  expect(
    mapSearchAreaRectToOriginalRect(
      { left: 2, top: 4, width: 21, height: 41 },
      { scale: 2, offset: { x: 100, y: 200 } },
    ),
  ).toEqual({ left: 101, top: 202, width: 11, height: 21 });
});
