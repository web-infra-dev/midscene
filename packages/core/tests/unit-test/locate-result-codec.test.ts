import {
  createCoordinateDistanceToPixels,
  createLocateResultCodec,
  resolveLocateResultCoordinates,
} from '@/ai-model/shared/model-locate-result';
import { mapLocateResultToUnroundedPixelBbox } from '@/ai-model/shared/model-locate-result/pixel-mapper';
import { locateResultExampleRegions } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { describe, expect, it } from '@rstest/core';

const locateCtx = (width: number, height: number) => ({
  preparedSize: { width, height },
});

describe('normalization basis', () => {
  it.each(['xy', 'yx'] as const)(
    'maps independently of bounds in %s order',
    (order) => {
      for (const normalizedBy of [1, 1000]) {
        for (const normalizationBasis of [
          undefined,
          'image-size',
          'last-pixel',
        ] as const) {
          for (const boundsType of [
            'closed',
            'left-closed-right-open',
          ] as const) {
            const coordinatesMeta = resolveLocateResultCoordinates({
              shape: 'bbox',
              order,
              normalizedBy,
              normalizationBasis,
              boundsType,
              rounding: 'none',
            });
            if (coordinatesMeta.shape !== 'bbox') {
              throw new Error('Expected bbox metadata');
            }
            const coordinates: [number, number, number, number] =
              order === 'xy'
                ? [0, normalizedBy / 2, normalizedBy, normalizedBy]
                : [normalizedBy / 2, 0, normalizedBy, normalizedBy];
            expect(
              mapLocateResultToUnroundedPixelBbox(
                { coordinates, coordinatesMeta },
                { width: 2000, height: 1000 },
              ),
            ).toEqual(
              normalizationBasis === 'last-pixel'
                ? [0, 499.5, 1999, 999]
                : [0, 500, 2000, 1000],
            );
            expect(
              mapLocateResultToUnroundedPixelBbox(
                { coordinates, coordinatesMeta },
                { width: 1, height: 1 },
              ),
            ).toEqual(
              normalizationBasis === 'last-pixel'
                ? [0, 0, 0, 0]
                : [0, 0.5, 1, 1],
            );
          }
        }
      }
    },
  );

  it.each(['image-size', 'last-pixel'] as const)(
    'uses %s for points and distances',
    (normalizationBasis) => {
      const coordinates = {
        shape: 'point' as const,
        normalizedBy: 1000,
        normalizationBasis,
        rounding: 'none' as const,
      };
      const codec = createLocateResultCodec({ coordinates });
      const size = { width: 2000, height: 1000 };
      expect(
        codec.toPixelResult([500, 500], { preparedSize: size }).center,
      ).toEqual(
        normalizationBasis === 'last-pixel' ? [999.5, 499.5] : [1000, 500],
      );
      const distance = createCoordinateDistanceToPixels(
        size,
        resolveLocateResultCoordinates(coordinates),
      );
      expect(distance(500, 'x')).toBe(
        normalizationBasis === 'last-pixel' ? 999.5 : 1000,
      );
      expect(distance(500, 'y')).toBe(
        normalizationBasis === 'last-pixel' ? 499.5 : 500,
      );
      const pixels = createLocateResultCodec({
        coordinates: { ...coordinates, normalizedBy: undefined },
      });
      expect(
        pixels.toPixelResult([500, 500], { preparedSize: size }).center,
      ).toEqual([500, 500]);
    },
  );

  it.each(['image-size', 'last-pixel'] as const)(
    'applies bounds after %s mapping',
    (normalizationBasis) => {
      for (const boundsType of ['closed', 'left-closed-right-open'] as const) {
        const codec = createLocateResultCodec({
          coordinates: {
            shape: 'bbox',
            normalizedBy: 1000,
            normalizationBasis,
            boundsType,
            rounding: 'none',
          },
        });
        const result = codec.toPixelResult(
          [100, 100, 200, 200],
          locateCtx(2000, 2000),
        );
        const left = normalizationBasis === 'last-pixel' ? 199.9 : 200;
        const width =
          (normalizationBasis === 'last-pixel' ? 199.9 : 200) +
          (boundsType === 'closed' ? 1 : 0);
        expect(result.rect?.left).toBeCloseTo(left);
        expect(result.rect?.width).toBeCloseTo(width);
        expect(result.center[0]).toBeCloseTo(left + width / 2);
      }
    },
  );
});

describe('normalization basis validation and rounding', () => {
  it('rejects an unsupported basis', () => {
    const codec = createLocateResultCodec({
      coordinates: {
        shape: 'point',
        normalizedBy: 1000,
        normalizationBasis: 'invalid' as 'image-size',
      },
    });
    expect(() =>
      codec.toPixelResult([500, 500], locateCtx(2000, 2000)),
    ).toThrow(/normalization basis/);
  });

  it.each([
    { rounding: 'round' as const, expected: 1000 },
    { rounding: 'trunc' as const, expected: 999 },
    { rounding: 'none' as const, expected: 999.5 },
  ])('applies $rounding after last-pixel mapping', ({ rounding, expected }) => {
    const codec = createLocateResultCodec({
      coordinates: {
        shape: 'point',
        normalizedBy: 1000,
        normalizationBasis: 'last-pixel',
        rounding,
      },
    });
    expect(
      codec.toPixelResult([500, 500], locateCtx(2000, 2000)).center,
    ).toEqual([expected, expected]);
  });
});

describe('createLocateResultCodec', () => {
  it.each([1, undefined])(
    'maps left-closed-right-open boxes with normalization %s',
    (normalizedBy) => {
      const codec = createLocateResultCodec({
        coordinates: {
          shape: 'bbox',
          boundsType: 'left-closed-right-open',
          normalizedBy,
          rounding: 'none',
        },
      });
      expect(
        codec.toPixelResult(
          normalizedBy ? [0, 0, 1, 1] : [0, 0, 100, 80],
          locateCtx(100, 80),
        ),
      ).toEqual({
        center: [50, 40],
        rect: { left: 0, top: 0, width: 100, height: 80 },
      });
      expect(
        codec.toPixelResult(
          normalizedBy ? [0.2, 0.1, 0.6, 0.5] : [20, 8, 60, 40],
          locateCtx(100, 80),
        ),
      ).toEqual({
        center: [40, 24],
        rect: { left: 20, top: 8, width: 40, height: 32 },
      });
    },
  );

  it('clips left-closed-right-open boxes independently from their click centers', () => {
    const codec = createLocateResultCodec({
      coordinates: {
        shape: 'bbox',
        boundsType: 'left-closed-right-open',
        rounding: 'none',
      },
    });
    expect(
      codec.toPixelResult([40, 20, 100, 80], {
        preparedSize: { width: 100, height: 80 },
        contentSize: { width: 60, height: 40 },
      }),
    ).toEqual({
      center: [59, 39],
      rect: { left: 40, top: 20, width: 20, height: 20 },
    });
    expect(() =>
      codec.toPixelResult([0, 0, 101, 80], locateCtx(100, 80)),
    ).toThrow(/exceed/);
  });

  it('preserves closed pixel bounds by default', () => {
    const codec = createLocateResultCodec({ coordinates: { shape: 'bbox' } });
    expect(
      codec.toPixelResult([20, 8, 60, 40], locateCtx(100, 80)).rect,
    ).toEqual({ left: 20, top: 8, width: 41, height: 33 });
    expect(() =>
      codec.toPixelResult([0, 0, 100, 80], locateCtx(100, 80)),
    ).toThrow(/exceed/);
  });

  it.each(['xy', 'yx'] as const)(
    'uses bounds semantics for pixel bbox centers in %s order',
    (order) => {
      const input =
        order === 'xy' ? [100, 200, 301, 400] : [200, 100, 400, 301];
      for (const boundsType of [
        undefined,
        'closed',
        'left-closed-right-open',
      ] as const) {
        const codec = createLocateResultCodec({
          coordinates: { shape: 'bbox', order, boundsType, rounding: 'none' },
        });
        const result = codec.toPixelResult(input, locateCtx(500, 500));
        expect(result.center).toEqual(
          boundsType === 'left-closed-right-open' ? [200.5, 300] : [201, 300.5],
        );
        expect(result.center).toEqual([
          result.rect!.left + result.rect!.width / 2,
          result.rect!.top + result.rect!.height / 2,
        ]);
      }
    },
  );

  it.each(['xy', 'yx'] as const)(
    'applies bounds semantics before final pixel rounding in %s order',
    (order) => {
      for (const normalizedBy of [undefined, 1, 1000]) {
        const xy = [0.1, 0.2, 0.3, 0.4].map(
          (value, index) =>
            value * (normalizedBy ?? (index % 2 === 0 ? 104 : 82)),
        );
        const input = order === 'xy' ? xy : [xy[1], xy[0], xy[3], xy[2]];
        for (const rounding of ['round', 'trunc', 'none'] as const) {
          for (const boundsType of [
            'closed',
            'left-closed-right-open',
          ] as const) {
            const codec = createLocateResultCodec({
              coordinates: {
                shape: 'bbox',
                order,
                normalizedBy,
                rounding,
                boundsType,
              },
            });
            const expected =
              boundsType === 'closed'
                ? { round: [21, 25], trunc: [21, 25], none: [21.3, 25.1] }
                : { round: [21, 25], trunc: [20, 24], none: [20.8, 24.6] };
            const { center } = codec.toPixelResult(input, locateCtx(104, 82));
            expect(center[0]).toBeCloseTo(expected[rounding][0], 10);
            expect(center[1]).toBeCloseTo(expected[rounding][1], 10);
          }
        }
      }
    },
  );

  it('uses actual bbox metadata from a custom parser and clamps the final center', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point' },
      parseRawLocateValue: () => ({
        coordinates: [99, 79, 99, 79],
        coordinatesMeta: { shape: 'bbox', order: 'xy', rounding: 'none' },
      }),
    });
    expect(codec.toPixelResult(null, locateCtx(100, 80))).toEqual({
      center: [99, 79],
      rect: { left: 99, top: 79, width: 1, height: 1 },
    });
  });

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
      bboxCenter: [38, 41],
      rect: { left: 13, top: 20, width: 51, height: 42 },
    },
    {
      rounding: 'trunc',
      center: [37, 40],
      bboxCenter: [38, 41],
      rect: { left: 12, top: 20, width: 52, height: 41 },
    },
    {
      rounding: 'none',
      center: [37.875, 40.5],
      bboxCenter: [38.375, 41],
      rect: { left: 12.625, top: 20.25, width: 51.5, height: 41.5 },
    },
  ] as const)(
    'applies $rounding consistently to positions, bbox metadata and distances',
    ({ rounding, center, bboxCenter, rect }) => {
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
      ).toEqual({ center: bboxCenter, rect });
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

  it.each([
    { rounding: 'round', expected: [11, 21] },
    { rounding: 'trunc', expected: [10, 20] },
    { rounding: 'none', expected: [10.75, 20.5] },
  ] as const)(
    'applies $rounding to pixel inputs and distances',
    ({ rounding, expected }) => {
      const codec = createLocateResultCodec({
        coordinates: { shape: 'point', rounding },
      });
      expect(
        codec.toPixelResult([10.75, 20.5], locateCtx(100, 80)).center,
      ).toEqual(expected);
      const distanceToPixels = createCoordinateDistanceToPixels(
        { width: 100, height: 80 },
        resolveLocateResultCoordinates({ shape: 'point', rounding }),
      );
      expect([
        distanceToPixels(-10.75, 'x'),
        distanceToPixels(20.5, 'y'),
      ]).toEqual(expected);
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
        center: [51, 41],
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
        codec.toPixelResult(
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
      codec.toPixelResult(
        ['100', '200.5', '300.25', '400'] as never,
        locateCtx(200, 100),
      ).rect,
    ).toEqual({ left: 20, top: 20, width: 41, height: 21 });
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
      codec.toPixelResult([500, 500, 500], locateCtx(640, 360)),
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
      center: [66, 46],
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

  it('rounds fractional pixel bbox corners and center with yx coordinates', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx' },
    });
    expect(
      codec.toPixelResult([20.5, 10.25, 41.25, 31.75], locateCtx(100, 80)),
    ).toEqual({
      center: [22, 31],
      rect: { left: 10, top: 21, width: 23, height: 21 },
    });
  });
});
