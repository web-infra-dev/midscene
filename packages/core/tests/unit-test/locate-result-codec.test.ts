import { createLocateResultCodec } from '@/ai-model/shared/model-locate-result';
import { locateResultExampleRegions } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { pixelBboxToRect } from '@/ai-model/workflows/grounding/locate-result-rect';
import { describe, expect, it } from 'vitest';

const locateCtx = (width: number, height: number) => ({
  preparedSize: { width, height },
});

describe('createLocateResultCodec', () => {
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
      codec.toPixelBbox([100, 200, 300, 400], locateCtx(200, 100)),
    ).toEqual([20, 20, 60, 40]);
  });

  it('accepts normalized bbox boundary values', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(codec.toPixelBbox([0, 0, 1000, 1000], locateCtx(200, 100))).toEqual([
      0, 0, 199, 99,
    ]);
  });

  it('maps normalized 0-1 bbox values when normalizedBy is 1', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1 },
    });

    expect(
      codec.toPixelBbox([0.1, 0.2, 0.3, 0.4], locateCtx(200, 100)),
    ).toEqual([20, 20, 60, 40]);
  });

  it('supports normalized point responses with the default point fallback', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(codec.promptSpec.resultValueDescription).toContain(
      'relative to the screenshot. Do NOT use pixel coordinates or screenshot width/height',
    );
    expect(codec.toPixelBbox([500, 250], locateCtx(200, 100))).toEqual([
      98, 24, 101, 26,
    ]);
    expect(codec.promptSpec.exampleValues[1]).toEqual([402, 463]);
  });

  it('supports normalized yx point responses with the default point fallback', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'yx', normalizedBy: 1000 },
    });

    expect(codec.toPixelBbox([250, 500], locateCtx(200, 100))).toEqual([
      98, 24, 101, 26,
    ]);
    expect(codec.promptSpec.exampleValues[1]).toEqual([463, 402]);
  });

  it('supports actual pixel point responses with the default point fallback', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy' },
    });

    expect(codec.toPixelBbox([20, 30], locateCtx(100, 80))).toEqual([
      10, 20, 30, 40,
    ]);
  });

  it('rejects actual pixel point coordinates outside image size', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy' },
    });

    expect(() => codec.toPixelBbox([120, 30], locateCtx(100, 80))).toThrow(
      /coordinates \[120,30\] exceed image size \[0, 100\]x\[0, 80\].*shape=point.*order=xy.*limits=\[100,80\]/,
    );
  });

  it('rejects actual pixel yx point coordinates with the raw coordinate order in error', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'yx' },
    });

    expect(() => codec.toPixelBbox([30, 120], locateCtx(100, 80))).toThrow(
      /coordinates \[30,120\] exceed image size \[0, 100\]x\[0, 80\].*shape=point.*order=yx.*limits=\[80,100\]/,
    );
  });

  it('rejects empty bbox responses instead of producing null coordinates', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelBbox([], locateCtx(640, 360))).toThrow(
      /invalid bbox data/,
    );
  });

  it('rejects non-finite coordinate values', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      codec.toPixelBbox([100, Number.NaN, 300, 400], locateCtx(640, 360)),
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
        coordinatesMeta: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
      }),
    });

    expect(() =>
      codec.toPixelBbox([652, '233; 713 251;'], locateCtx(640, 360)),
    ).toThrow(
      /invalid parsed locate result: bbox coordinates must be 4 finite numbers, got \[652,"233; 713 251;"\]/,
    );
  });

  it('rejects non-array coordinate values before numeric parsing', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelBbox(123, locateCtx(640, 360))).toThrow(
      /invalid bbox data/,
    );
  });

  it('rejects point coordinate values with fewer than two entries', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelBbox([500], locateCtx(640, 360))).toThrow(
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

    expect(() =>
      codec.toPixelBbox([0, 500, 1080, 1000], locateCtx(720, 1600)),
    ).toThrowError(
      /coordinates \[0,500,1080,1000\] exceed normalized range \[0, 1000\].*shape=bbox.*order=xy.*normalizedBy=1000.*limits=\[1000,1000,1000,1000\]/,
    );
  });

  it('rejects negative normalized bbox coordinates during rect adaptation', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() =>
      codec.toPixelBbox([-1, 100, 200, 300], locateCtx(640, 360)),
    ).toThrow(/exceed normalized range \[0, 1000\]/);
  });

  it('rejects inverted normalized bbox coordinates', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      codec.toPixelBbox([300, 200, 100, 400], locateCtx(200, 100)),
    ).toThrow(/invalid coordinate order/);
  });

  it('rejects normalized point coordinates outside [0, 1000]', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      codec.toPixelBbox([1005, 500], locateCtx(200, 100)),
    ).toThrowError(
      /coordinates \[1005,500\] exceed normalized range \[0, 1000\].*shape=point.*order=xy.*normalizedBy=1000.*limits=\[1000,1000\]/,
    );
  });

  it('rejects normalized yx point coordinates with the raw coordinate order in error', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'point', order: 'yx', normalizedBy: 1000 },
    });

    expect(() =>
      codec.toPixelBbox([500, 1005], locateCtx(200, 100)),
    ).toThrowError(
      /coordinates \[500,1005\] exceed normalized range \[0, 1000\].*shape=point.*order=yx.*normalizedBy=1000.*limits=\[1000,1000\]/,
    );
  });

  it('allows actual-pixel bbox coordinates above 1000 when inside image size', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy' },
    });

    expect(
      pixelBboxToRect(
        codec.toPixelBbox([0, 500, 1080, 1920], locateCtx(1440, 2560)),
      ),
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

    expect(() =>
      codec.toPixelBbox([0, 500, 1080, 1920], locateCtx(720, 1600)),
    ).toThrow(
      /coordinates \[0,500,1080,1920\] exceed image size \[0, 720\]x\[0, 1600\].*limits=\[720,1600,720,1600\]/,
    );
  });

  it('rejects actual-pixel yx bbox coordinates with the raw coordinate order in error', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx' },
    });

    expect(() =>
      codec.toPixelBbox([500, 0, 1920, 1080], locateCtx(720, 1600)),
    ).toThrow(
      /coordinates \[500,0,1920,1080\] exceed image size \[0, 720\]x\[0, 1600\].*order=yx.*limits=\[1600,720,1600,720\]/,
    );
  });

  it('rejects empty bbox responses during rect adaptation', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() => codec.toPixelBbox([], locateCtx(640, 360))).toThrow(
      /invalid bbox data/,
    );
  });

  it('rejects inverted pixel bbox returned by custom mapping', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy' },
      mapLocateResultToPixelBbox: () => [30, 20, 10, 40],
    });

    expect(() =>
      codec.toPixelBbox([10, 20, 30, 40], locateCtx(100, 80)),
    ).toThrow(/invalid coordinate order/);
  });

  it('rejects non-finite pixel bbox returned by custom mapping', () => {
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox', order: 'xy' },
      mapLocateResultToPixelBbox: () => [10, Number.NaN, 30, 40],
    });

    expect(() =>
      codec.toPixelBbox([10, 20, 30, 40], locateCtx(100, 80)),
    ).toThrow(/invalid locate bbox data/);
  });
});
