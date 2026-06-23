import { locateResultExampleRegions } from '@/ai-model/prompts/locate-result-coordinates';
import { createLocateResultAdapter } from '@/ai-model/shared/model-locate-result';
import { pixelBboxToRect } from '@/ai-model/workflows/inspect/locate-result-rect';
import { describe, expect, it, vi } from 'vitest';

const locateCtx = (width: number, height: number) => ({
  preparedSize: { width, height },
});

describe('createLocateResultAdapter', () => {
  it('uses valid xyxy regions for built-in prompt examples', () => {
    for (const [xmin, ymin, xmax, ymax] of locateResultExampleRegions) {
      expect(xmin).toBeGreaterThanOrEqual(0);
      expect(ymin).toBeGreaterThanOrEqual(0);
      expect(xmax).toBeGreaterThan(xmin);
      expect(ymax).toBeGreaterThan(ymin);
    }
  });

  it('picks bbox/bbox_2d and maps normalized xyxy by default', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      adapter.adaptElementLocateResultToPixelBbox(
        { bbox_2d: [100, 200, 300, 400] },
        locateCtx(200, 100),
      ),
    ).toEqual([20, 20, 60, 40]);
  });

  it('accepts normalized bbox boundary values', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      adapter.adaptElementLocateResultToPixelBbox(
        [0, 0, 1000, 1000],
        locateCtx(200, 100),
      ),
    ).toEqual([0, 0, 199, 99]);
  });

  it('maps normalized 0-1 bbox values when normalizedBy is 1', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1 },
    });

    expect(
      adapter.adaptElementLocateResultToPixelBbox(
        [0.1, 0.2, 0.3, 0.4],
        locateCtx(200, 100),
      ),
    ).toEqual([20, 20, 60, 40]);
  });

  it('supports normalized point responses with the default point fallback', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(adapter.promptSpec.resultValueDescription).toContain(
      'relative to the screenshot. Do NOT use pixel coordinates or screenshot width/height',
    );
    expect(
      adapter.adaptElementLocateResultToPixelBbox(
        { point: [500, 250] },
        locateCtx(200, 100),
      ),
    ).toEqual([98, 24, 101, 26]);
    expect(adapter.promptSpec.exampleValues[1]).toEqual([402, 463]);
  });

  it('supports normalized yx point responses with the default point fallback', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'yx', normalizedBy: 1000 },
    });

    expect(
      adapter.adaptElementLocateResultToPixelBbox(
        { point: [250, 500] },
        locateCtx(200, 100),
      ),
    ).toEqual([98, 24, 101, 26]);
    expect(adapter.promptSpec.exampleValues[1]).toEqual([463, 402]);
  });

  it('supports actual pixel point responses with the default point fallback', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'xy' },
    });

    expect(
      adapter.adaptElementLocateResultToPixelBbox([20, 30], locateCtx(100, 80)),
    ).toEqual([10, 20, 30, 40]);
  });

  it('rejects actual pixel point coordinates outside image size', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'xy' },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [120, 30],
        locateCtx(100, 80),
      ),
    ).toThrow(
      /coordinates \[120,30\] exceed image size \[0, 100\]x\[0, 80\].*shape=point.*order=xy.*limits=\[100,80\]/,
    );
  });

  it('rejects actual pixel yx point coordinates with the raw coordinate order in error', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'yx' },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [30, 120],
        locateCtx(100, 80),
      ),
    ).toThrow(
      /coordinates \[30,120\] exceed image size \[0, 100\]x\[0, 80\].*shape=point.*order=yx.*limits=\[80,100\]/,
    );
  });

  it('extracts bbox reference locate results through the adapter', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      adapter.adaptSectionLocateResultToPixelBboxGroup(
        {
          bbox: [0, 0, 100, 100],
          references_bbox_2d: [[100, 200, 300, 400], '10 20 30 40'],
        },
        locateCtx(200, 100),
      ).references,
    ).toEqual([
      [20, 20, 60, 40],
      [2, 2, 6, 4],
    ]);
  });

  it('extracts point reference locate results through the adapter', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      adapter.adaptSectionLocateResultToPixelBboxGroup(
        {
          point: [500, 250],
          references_point: [
            [500, 250],
            [100, 200],
          ],
        },
        locateCtx(200, 100),
      ).references,
    ).toEqual([
      [98, 24, 101, 26],
      [18, 19, 22, 21],
    ]);
  });

  it('rejects empty bbox responses instead of producing null coordinates', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        { bbox: [], errors: ['element not found'] },
        locateCtx(640, 360),
      ),
    ).toThrow(/invalid bbox data/);
  });

  it('rejects non-finite coordinate values', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [100, Number.NaN, 300, 400],
        locateCtx(640, 360),
      ),
    ).toThrow(/invalid bbox data/);
  });

  it('rejects invalid parsed adapter results before coordinate range checks', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
      parseRawLocateValue: () => ({
        type: 'bbox',
        coordinates: [652, '233; 713 251;'] as any,
      }),
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        { bbox: [652, '233; 713 251;'] },
        locateCtx(640, 360),
      ),
    ).toThrow(
      /invalid parsed locate result: bbox coordinates must be 4 finite numbers, got \[652,"233; 713 251;"\]/,
    );
  });

  it('rejects non-array coordinate values before numeric parsing', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(123, locateCtx(640, 360)),
    ).toThrow(/invalid bbox data/);
  });

  it('rejects point coordinate values with fewer than two entries', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox([500], locateCtx(640, 360)),
    ).toThrow(/invalid point data/);
  });

  it('rejects non-positive normalizedBy values', () => {
    expect(() =>
      createLocateResultAdapter({
        coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 0 },
      }),
    ).toThrow(/normalizedBy must be positive: 0/);
  });

  it('rejects normalized bbox coordinates outside [0, 1000]', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [0, 500, 1080, 1000],
        locateCtx(720, 1600),
      ),
    ).toThrowError(
      /coordinates \[0,500,1080,1000\] exceed normalized range \[0, 1000\].*shape=bbox.*order=xy.*normalizedBy=1000.*limits=\[1000,1000,1000,1000\]/,
    );
  });

  it('rejects negative normalized bbox coordinates during rect adaptation', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [-1, 100, 200, 300],
        locateCtx(640, 360),
      ),
    ).toThrow(/exceed normalized range \[0, 1000\]/);
  });

  it('rejects inverted normalized bbox coordinates', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [300, 200, 100, 400],
        locateCtx(200, 100),
      ),
    ).toThrow(/invalid coordinate order/);
  });

  it('rejects normalized point coordinates outside [0, 1000]', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [1005, 500],
        locateCtx(200, 100),
      ),
    ).toThrowError(
      /coordinates \[1005,500\] exceed normalized range \[0, 1000\].*shape=point.*order=xy.*normalizedBy=1000.*limits=\[1000,1000\]/,
    );
  });

  it('rejects normalized yx point coordinates with the raw coordinate order in error', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'point', order: 'yx', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [500, 1005],
        locateCtx(200, 100),
      ),
    ).toThrowError(
      /coordinates \[500,1005\] exceed normalized range \[0, 1000\].*shape=point.*order=yx.*normalizedBy=1000.*limits=\[1000,1000\]/,
    );
  });

  it('allows actual-pixel bbox coordinates above 1000 when inside image size', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy' },
    });

    expect(
      pixelBboxToRect(
        adapter.adaptElementLocateResultToPixelBbox(
          [0, 500, 1080, 1920],
          locateCtx(1440, 2560),
        ),
      ),
    ).toEqual({
      left: 0,
      top: 500,
      width: 1081,
      height: 1421,
    });
  });

  it('rejects actual-pixel bbox coordinates outside image size', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy' },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [0, 500, 1080, 1920],
        locateCtx(720, 1600),
      ),
    ).toThrow(
      /coordinates \[0,500,1080,1920\] exceed image size \[0, 720\]x\[0, 1600\].*limits=\[720,1600,720,1600\]/,
    );
  });

  it('rejects actual-pixel yx bbox coordinates with the raw coordinate order in error', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'yx' },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [500, 0, 1920, 1080],
        locateCtx(720, 1600),
      ),
    ).toThrow(
      /coordinates \[500,0,1920,1080\] exceed image size \[0, 720\]x\[0, 1600\].*order=yx.*limits=\[1600,720,1600,720\]/,
    );
  });

  it('rejects empty bbox responses during rect adaptation', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox([], locateCtx(640, 360)),
    ).toThrow(/invalid bbox data/);
  });

  it('allows custom parsing and mapping in standard definition', () => {
    const parseRawLocateValue = vi.fn(() => ({
      type: 'point' as const,
      coordinates: [3, 4] as [number, number],
    }));
    const mapLocateResultToPixelBbox = vi.fn(
      (): [number, number, number, number] => [1, 2, 3, 4],
    );
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy' },
      parseRawLocateValue,
      mapLocateResultToPixelBbox,
    });

    expect(
      adapter.adaptSectionLocateResultToPixelBboxGroup(
        {
          bbox: { x: 3, y: 4 },
          references_bbox: [{ x: 5, y: 6 }],
        },
        locateCtx(100, 100),
      ),
    ).toEqual({
      target: [1, 2, 3, 4],
      references: [[1, 2, 3, 4]],
    });
    expect(parseRawLocateValue).toHaveBeenCalledWith({ x: 3, y: 4 });
    expect(parseRawLocateValue).toHaveBeenCalledWith({ x: 5, y: 6 });
    expect(mapLocateResultToPixelBbox).toHaveBeenCalledWith(
      { type: 'point', coordinates: [3, 4] },
      locateCtx(100, 100),
    );
  });

  it('omits references when section locate response has no reference fields', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(
      adapter.adaptSectionLocateResultToPixelBboxGroup(
        {
          bbox: [100, 200, 300, 400],
        },
        locateCtx(200, 100),
      ),
    ).toEqual({
      target: [20, 20, 60, 40],
    });
  });

  it('throws when object locate responses do not include a recognized coordinate field', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        { region: [100, 200, 300, 400] },
        locateCtx(200, 100),
      ),
    ).toThrow(/does not contain a recognizable locate result field/);
  });

  it('rejects inverted pixel bbox returned by custom mapping', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy' },
      mapLocateResultToPixelBbox: () => [30, 20, 10, 40],
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [10, 20, 30, 40],
        locateCtx(100, 80),
      ),
    ).toThrow(/invalid coordinate order/);
  });

  it('rejects non-finite pixel bbox returned by custom mapping', () => {
    const adapter = createLocateResultAdapter({
      coordinates: { shape: 'bbox', order: 'xy' },
      mapLocateResultToPixelBbox: () => [10, Number.NaN, 30, 40],
    });

    expect(() =>
      adapter.adaptElementLocateResultToPixelBbox(
        [10, 20, 30, 40],
        locateCtx(100, 80),
      ),
    ).toThrow(/invalid locate bbox data/);
  });

  it('allows custom adapters to own prompt contract and locate result mapping', () => {
    const adaptElementLocateResultToPixelBbox = vi.fn(
      (input: unknown, { preparedSize }: ReturnType<typeof locateCtx>) => {
        const { width, height } = preparedSize;
        const [x, y, boxWidth, boxHeight] = (
          input as { payload: { region: [number, number, number, number] } }
        ).payload.region;

        return [
          x * width,
          y * height,
          (x + boxWidth) * width,
          (y + boxHeight) * height,
        ] as [number, number, number, number];
      },
    );
    const adaptSectionLocateResultToPixelBboxGroup = vi.fn((input, ctx) => ({
      target: adaptElementLocateResultToPixelBbox(input, ctx),
    }));
    const adaptPlanningParamToPixelBbox = vi.fn(
      adaptElementLocateResultToPixelBbox,
    );
    const adapter = createLocateResultAdapter({
      kind: 'custom',
      promptSpec: {
        resultKey: 'region',
        resultValueSchema: '[number, number, number, number]',
        resultValueDescription: 'normalized xywh',
        resultNoun: 'normalized xywh region',
        resultNounPlural: 'normalized xywh regions',
        exampleValues: [[0.1, 0.2, 0.3, 0.4]],
      },
      adaptElementLocateResultToPixelBbox,
      adaptSectionLocateResultToPixelBboxGroup,
      adaptPlanningParamToPixelBbox,
    });

    expect(adapter.promptSpec.resultKey).toBe('region');
    expect(adapter.promptSpec.exampleValues[0]).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(
      pixelBboxToRect(
        adapter.adaptElementLocateResultToPixelBbox(
          {
            payload: { region: [0.125, 0.25, 0.375, 0.5] },
          },
          locateCtx(1000, 1000),
        ),
      ),
    ).toEqual({
      left: 125,
      top: 250,
      width: 376,
      height: 501,
    });
    expect(adaptElementLocateResultToPixelBbox).toHaveBeenCalledWith(
      {
        payload: { region: [0.125, 0.25, 0.375, 0.5] },
      },
      locateCtx(1000, 1000),
    );
    expect(adaptSectionLocateResultToPixelBboxGroup).not.toHaveBeenCalled();
    expect(adaptPlanningParamToPixelBbox).not.toHaveBeenCalled();
  });
});
