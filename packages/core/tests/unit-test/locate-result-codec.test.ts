import {
  createCoordinateDistanceToPixels,
  createLocateResultCodec,
  resolveLocateResultCoordinates,
} from '@/ai-model/shared/model-locate-result';
import { locateResultExampleRegions } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { describe, expect, it } from '@rstest/core';

const locateCtx = (width: number, height: number) => ({
  preparedSize: { width, height },
});

describe('createLocateResultCodec', () => {
  it.each([undefined, 'invalid'])(
    'rejects custom parser metadata without valid rounding: %s',
    (rounding) => {
      const codec = createLocateResultCodec({
        coordinates: { shape: 'point' },
        parseRawLocateValue: () => ({
          coordinates: [10, 20],
          coordinatesMeta: {
            shape: 'point',
            order: 'xy',
            rounding: rounding as any,
          },
        }),
      });
      expect(() => codec.toPixelResult(null, locateCtx(100, 80))).toThrow(
        /invalid locate coordinate rounding/,
      );
    },
  );
  it('resolves default rounding before mapping positions and distances', () => {
    const coordinates = resolveLocateResultCoordinates({
      shape: 'point',
      normalizedBy: 1000,
    });
    expect(coordinates.rounding).toBe('round');
    const size = { width: 101, height: 81 };
    expect(createCoordinateDistanceToPixels(size, coordinates)(375, 'x')).toBe(
      38,
    );
    expect(
      createLocateResultCodec({ coordinates }).toPixelResult([375, 500], {
        preparedSize: size,
      }).center,
    ).toEqual([38, 41]);
  });
  it('maps normalized coordinates using the full image size before clamping', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', normalizedBy: 1000 },
    });
    expect(
      codec.toPixelResult([999, 999], locateCtx(2000, 1000)).center,
    ).toEqual([1998, 999]);
    expect(
      codec.toPixelResult([1000, 1000], locateCtx(2000, 1000)).center,
    ).toEqual([1999, 999]);
  });

  it.each([
    {
      rounding: 'round',
      center: [38, 41],
      rect: { left: 13, top: 20, width: 51, height: 42 },
    },
    {
      rounding: 'trunc',
      center: [37, 40],
      rect: { left: 12, top: 20, width: 52, height: 41 },
    },
    {
      rounding: 'none',
      center: [37.875, 40.5],
      rect: { left: 12.625, top: 20.25, width: 51.5, height: 41.5 },
    },
  ] as const)(
    'applies $rounding consistently to positions, bbox metadata and distances',
    ({ rounding, center, rect }) => {
      const coordinates = {
        shape: 'point',
        order: 'xy',
        normalizedBy: 1000,
        rounding,
      } as const;
      const size = { width: 101, height: 81 };
      const pointCodec = createLocateResultCodec({ coordinates });
      const bboxCodec = createLocateResultCodec({
        coordinates: { ...coordinates, shape: 'bbox' },
      });
      const distanceToPixels = createCoordinateDistanceToPixels(
        size,
        coordinates,
      );
      expect(
        pointCodec.toPixelResult([375, 500], { preparedSize: size }).center,
      ).toEqual(center);
      expect(
        bboxCodec.toPixelResult([125, 250, 625, 750], { preparedSize: size }),
      ).toEqual({ center, rect });
      expect([distanceToPixels(-375, 'x'), distanceToPixels(500, 'y')]).toEqual(
        center,
      );
      expect(
        pointCodec.toPixelResult([1000, 1000], { preparedSize: size }).center,
      ).toEqual([100, 80]);
      expect([
        distanceToPixels(1000, 'x'),
        distanceToPixels(-1000, 'y'),
      ]).toEqual([101, 81]);
    },
  );

  it.each([
    { rounding: 'trunc', center: [37, 40] },
    { rounding: 'round', center: [38, 41] },
    { rounding: 'none', center: [37.875, 40.5] },
  ] as const)(
    'uses the explicit $rounding policy from custom parser metadata',
    ({ rounding, center }) => {
      const codec = createLocateResultCodec({
        coordinates: { shape: 'bbox', normalizedBy: 1000, rounding: 'trunc' },
        parseRawLocateValue: () => ({
          coordinates: [0.375, 0.5],
          coordinatesMeta: {
            shape: 'point',
            order: 'xy',
            normalizedBy: 1,
            rounding,
          },
        }),
      });
      expect(codec.toPixelResult(null, locateCtx(101, 81)).center).toEqual(
        center,
      );
    },
  );

  it.each(['round', 'trunc', 'none'] as const)(
    'preserves pixel input precision with rounding=%s',
    (rounding) => {
      const codec = createLocateResultCodec({
        coordinates: { shape: 'point', rounding },
      });
      expect(
        codec.toPixelResult([10.75, 20.5], locateCtx(100, 80)).center,
      ).toEqual([10.75, 20.5]);
    },
  );

  it('uses valid xyxy regions for built-in prompt examples', () => {
    for (const [xmin, ymin, xmax, ymax] of locateResultExampleRegions) {
      expect(xmin).toBeGreaterThanOrEqual(0);
      expect(ymin).toBeGreaterThanOrEqual(0);
      expect(xmax).toBeGreaterThan(xmin);
      expect(ymax).toBeGreaterThan(ymin);
    }
  });

  it('maps a raw normalized xyxy bbox value by default', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      codec.toPixelResult([100, 200, 300, 400], locateCtx(200, 100)).rect,
    ).toEqual({ left: 20, top: 20, width: 41, height: 21 });
  });

  it('accepts normalized bbox boundary values', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      codec.toPixelResult([0, 0, 1000, 1000], locateCtx(200, 100)).rect,
    ).toEqual({ left: 0, top: 0, width: 200, height: 100 });
  });

  it.each([1, 1000])(
    'maps normalized point and bbox coordinates with consistent rounding (normalizedBy=%s)',
    (normalizedBy) => {
      const pointCodec = createLocateResultCodec({
        coordinates: { shape: 'point', normalizedBy },
      });
      const bboxCodec = createLocateResultCodec({
        coordinates: { shape: 'bbox', normalizedBy },
      });
      const half = normalizedBy / 2;
      const context = locateCtx(100, 80);
      expect(pointCodec.toPixelResult([half, half], context)).toEqual({
        center: [50, 40],
      });
      expect(
        bboxCodec.toPixelResult([half, half, half, half], context),
      ).toEqual({
        center: [50, 40],
        rect: { left: 50, top: 40, width: 1, height: 1 },
      });
    },
  );

  it('maps normalized 0-1 bbox values when normalizedBy is 1', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1 },
    });

    expect(
      codec.toPixelResult([0.1, 0.2, 0.3, 0.4], locateCtx(200, 100)).rect,
    ).toEqual({ left: 20, top: 20, width: 41, height: 21 });
  });

  it('supports normalized point responses without creating a rect', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(codec.promptSpec.resultValueDescription).toContain(
      'relative to the screenshot. Do NOT use pixel coordinates or screenshot width/height',
    );
    expect(codec.toPixelResult([500, 250], locateCtx(200, 100))).toEqual({
      center: [100, 25],
    });
    expect(codec.promptSpec.exampleValues[1]).toEqual([402, 463]);
  });

  it('supports normalized yx point responses without creating a rect', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'yx', normalizedBy: 1000 },
    });

    expect(codec.toPixelResult([250, 500], locateCtx(200, 100))).toEqual({
      center: [100, 25],
    });
    expect(codec.promptSpec.exampleValues[1]).toEqual([463, 402]);
  });

  it('supports actual pixel point responses without creating a rect', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy' },
    });

    expect(codec.toPixelResult([20, 30], locateCtx(100, 80))).toEqual({
      center: [20, 30],
    });
  });

  it('rejects actual pixel point coordinates outside image size', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy' },
    });

    expect(
      () => codec.toPixelResult([120, 30], locateCtx(100, 80)).rect,
    ).toThrow(
      /coordinates \[120,30\] exceed image size \[0, 99\]x\[0, 79\].*shape=point.*order=xy.*limits=\[99,79\]/,
    );
  });

  it('rejects actual pixel yx point coordinates with the raw coordinate order in error', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'yx' },
    });

    expect(
      () => codec.toPixelResult([30, 120], locateCtx(100, 80)).rect,
    ).toThrow(
      /coordinates \[30,120\] exceed image size \[0, 99\]x\[0, 79\].*shape=point.*order=yx.*limits=\[79,99\]/,
    );
  });

  it('rejects empty bbox responses instead of producing null coordinates', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelResult([], locateCtx(640, 360)).rect).toThrow(
      /invalid bbox data/,
    );
  });

  it('rejects non-finite coordinate values', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      () =>
        codec.toPixelResult([100, Number.NaN, 300, 400], locateCtx(640, 360))
          .rect,
    ).toThrow(/invalid bbox data/);
  });

  it.each([null, true, false, '', '   '])(
    'rejects coercible non-coordinate bbox value: %j',
    (invalidValue) => {
      const codec = createLocateResultCodec({
        coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
      });

      expect(() =>
        codec.toPixelBbox(
          [invalidValue, 100, 300, 400] as never,
          locateCtx(640, 360),
        ),
      ).toThrow(/invalid bbox data/);
    },
  );

  it('accepts decimal coordinate strings without general JavaScript coercion', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      codec.toPixelBbox(
        ['100', '200.5', '300.25', '400'] as never,
        locateCtx(200, 100),
      ),
    ).toEqual([20, 20, 60, 40]);
  });

  it('rejects invalid parsed adapter results before coordinate range checks', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
      parseRawLocateValue: () => ({
        coordinates: [652, '233; 713 251;'] as any,
        coordinatesMeta: {
          shape: 'bbox',
          order: 'xy',
          normalizedBy: 1000,
          rounding: 'round' as const,
        },
      }),
    });

    expect(
      () =>
        codec.toPixelResult([652, '233; 713 251;'], locateCtx(640, 360)).rect,
    ).toThrow(
      /invalid parsed locate result: bbox coordinates must be 4 finite numbers, got \[652,"233; 713 251;"\]/,
    );
  });

  it('rejects non-array coordinate values before numeric parsing', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelResult(123, locateCtx(640, 360)).rect).toThrow(
      /invalid bbox data/,
    );
  });

  it('rejects point coordinate values with fewer than two entries', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelResult([500], locateCtx(640, 360)).rect).toThrow(
      /invalid point data/,
    );
  });

  it('rejects point coordinate values with more than two entries', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      codec.toPixelBbox([500, 500, 500], locateCtx(640, 360)),
    ).toThrow(/invalid point data/);
  });

  it('rejects non-positive normalizedBy values', () => {
    expect(() =>
      createLocateResultCodec({
        coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 0 },
      }),
    ).toThrow(/normalizedBy must be positive: 0/);
  });

  it('rejects normalized bbox coordinates outside [0, 1000]', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      () =>
        codec.toPixelResult([0, 500, 1080, 1000], locateCtx(720, 1600)).rect,
    ).toThrowError(
      /coordinates \[0,500,1080,1000\] exceed normalized range \[0, 1000\].*shape=bbox.*order=xy.*normalizedBy=1000.*limits=\[1000,1000,1000,1000\]/,
    );
  });

  it('rejects negative normalized bbox coordinates during rect adaptation', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(
      () => codec.toPixelResult([-1, 100, 200, 300], locateCtx(640, 360)).rect,
    ).toThrow(/exceed normalized range \[0, 1000\]/);
  });

  it('rejects inverted normalized bbox coordinates', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      () => codec.toPixelResult([300, 200, 100, 400], locateCtx(200, 100)).rect,
    ).toThrow(/invalid.*coordinate order/);
  });

  it.each(['xy', 'yx'] as const)(
    'rejects reversed %s bbox corners with subpixel differences',
    (order) => {
      const codec = createLocateResultCodec({
        coordinates: { shape: 'bbox', order, normalizedBy: 1000 },
      });
      expect(() =>
        codec.toPixelResult([100.2, 200, 100.1, 400], locateCtx(100, 80)),
      ).toThrow(/invalid.*coordinate order/);
      expect(() =>
        codec.toPixelResult([100, 200.2, 300, 200.1], locateCtx(100, 80)),
      ).toThrow(/invalid.*coordinate order/);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid normalization from a custom parser: %s',
    (normalizedBy) => {
      const codec = createLocateResultCodec({
        coordinates: { shape: 'point' },
        parseRawLocateValue: () => ({
          coordinates: [10, 20],
          coordinatesMeta: {
            shape: 'point',
            order: 'xy',
            normalizedBy,
            rounding: 'round' as const,
          },
        }),
      });
      expect(() => codec.toPixelResult(null, locateCtx(100, 80))).toThrow(
        /normalizedBy must be positive and finite/,
      );
    },
  );

  it('rejects invalid axis order from a custom parser', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point' },
      parseRawLocateValue: () => ({
        coordinates: [10, 20],
        coordinatesMeta: {
          shape: 'point',
          order: 'invalid' as any,
          rounding: 'round' as const,
        },
      }),
    });
    expect(() => codec.toPixelResult(null, locateCtx(100, 80))).toThrow(
      /invalid locate coordinate order/,
    );
  });

  it('clamps padding points and bbox metadata independently and permits equal corners', () => {
    const context = {
      preparedSize: { width: 100, height: 80 },
      contentSize: { width: 70, height: 60 },
    };
    const pointCodec = createLocateResultCodec({
      coordinates: { shape: 'point' },
    });
    expect(pointCodec.toPixelResult([90, 70], context)).toEqual({
      center: [69, 59],
    });
    const bboxCodec = createLocateResultCodec({
      coordinates: { shape: 'bbox' },
    });
    expect(bboxCodec.toPixelResult([40, 20, 90, 70], context)).toEqual({
      center: [65, 45],
      rect: { left: 40, top: 20, width: 30, height: 40 },
    });
    expect(bboxCodec.toPixelResult([90, 70, 90, 70], context)).toEqual({
      center: [69, 59],
      rect: { left: 69, top: 59, width: 1, height: 1 },
    });
    expect(() => pointCodec.toPixelResult([100, 70], context)).toThrow(
      /exceed image size/,
    );
  });

  it('rejects normalized point coordinates outside [0, 1000]', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      () => codec.toPixelResult([1005, 500], locateCtx(200, 100)).rect,
    ).toThrowError(
      /coordinates \[1005,500\] exceed normalized range \[0, 1000\].*shape=point.*order=xy.*normalizedBy=1000.*limits=\[1000,1000\]/,
    );
  });

  it('rejects normalized yx point coordinates with the raw coordinate order in error', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'yx', normalizedBy: 1000 },
    });

    expect(
      () => codec.toPixelResult([500, 1005], locateCtx(200, 100)).rect,
    ).toThrowError(
      /coordinates \[500,1005\] exceed normalized range \[0, 1000\].*shape=point.*order=yx.*normalizedBy=1000.*limits=\[1000,1000\]/,
    );
  });

  it('allows actual-pixel bbox coordinates above 1000 when inside image size', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy' },
    });

    expect(
      codec.toPixelResult([0, 500, 1080, 1920], locateCtx(1440, 2560)).rect,
    ).toEqual({
      left: 0,
      top: 500,
      width: 1081,
      height: 1421,
    });
  });

  it('rejects actual-pixel bbox coordinates outside image size', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy' },
    });

    expect(
      () =>
        codec.toPixelResult([0, 500, 1080, 1920], locateCtx(720, 1600)).rect,
    ).toThrow(
      /coordinates \[0,500,1080,1920\] exceed image size \[0, 719\]x\[0, 1599\].*limits=\[719,1599,719,1599\]/,
    );
  });

  it('rejects actual-pixel yx bbox coordinates with the raw coordinate order in error', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx' },
    });

    expect(
      () =>
        codec.toPixelResult([500, 0, 1920, 1080], locateCtx(720, 1600)).rect,
    ).toThrow(
      /coordinates \[500,0,1920,1080\] exceed image size \[0, 719\]x\[0, 1599\].*order=yx.*limits=\[1599,719,1599,719\]/,
    );
  });

  it('rejects empty bbox responses during rect adaptation', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelResult([], locateCtx(640, 360)).rect).toThrow(
      /invalid bbox data/,
    );
  });

  it('preserves fractional pixel bbox corners and center with yx coordinates', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx' },
    });
    expect(
      codec.toPixelResult([20.5, 10.25, 41.25, 31.75], locateCtx(100, 80)),
    ).toEqual({
      center: [21, 30.875],
      rect: { left: 10.25, top: 20.5, width: 22.5, height: 21.75 },
    });
  });
});
