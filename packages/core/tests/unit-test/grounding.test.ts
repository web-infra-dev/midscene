import { getModelAdapter } from '@/ai-model/models';
import { mapNormalized01000XyxyToActualPixelBbox } from '@/ai-model/shared/model-locate-result';
import { adaptModelLocateResultToRect } from '@/ai-model/workflows/inspect/locate-result-rect';
import type { TModelFamily } from '@midscene/shared/env';

import { describe, expect, it } from 'vitest';

function normalizeWithModel(
  modelFamily: TModelFamily,
  input: unknown,
  width: number,
  height: number,
) {
  const locateAdapter = getModelAdapter(modelFamily).locate;
  if (locateAdapter.kind !== 'standard') {
    throw new Error(`${modelFamily} should use standard locate adapter`);
  }
  return locateAdapter.resultAdapter.normalizeResultToPixelBbox(
    locateAdapter.resultAdapter.resolveLocateResult(input),
    { width, height },
  );
}

describe('qwen-vl-2.5', () => {
  it('adaptQwenBbox', () => {
    const result = normalizeWithModel(
      'qwen2.5-vl',
      [100.3, 200.4, 301, 401],
      0,
      0,
    );
    expect(result).toEqual([100, 200, 301, 401]);
  });

  it('adaptQwenBbox with 2 points', () => {
    const result = normalizeWithModel('qwen2.5-vl', [100, 200], 0, 0);
    expect(result).toEqual([100, 200, 120, 220]);
  });

  it('adaptQwenBbox with invalid bbox data', () => {
    expect(() => normalizeWithModel('qwen2.5-vl', [100], 0, 0)).toThrow();
  });

  it('adaptModelLocateResultToRect - size exceed image size', () => {
    const result = adaptModelLocateResultToRect([100, 200, 1000, 2000], {
      width: 1000,
      height: 1000,
      modelFamily: 'glm-v',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 801,
        "left": 100,
        "top": 200,
        "width": 901,
      }
    `);
  });

  it('adaptModelLocateResultToRect - size exceed image size - 2', () => {
    const result = adaptModelLocateResultToRect([158, 114, 526, 179], {
      width: 684,
      height: 301,
      modelFamily: 'qwen2.5-vl',
      mapping: {
        offset: { x: 611, y: 221 },
        scale: 1,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 66,
        "left": 769,
        "top": 335,
        "width": 369,
      }
    `);
  });

  it('adaptModelLocateResultToRect - size exceed image size - 3', () => {
    const result = adaptModelLocateResultToRect([25, 154, 153, 186], {
      width: 301,
      height: 164,
      modelFamily: 'qwen2.5-vl',
      mapping: {
        offset: { x: 0, y: 752 },
        scale: 1,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 11,
        "left": 25,
        "top": 906,
        "width": 129,
      }
    `);
  });

  it('adaptModelLocateResultToRect - size exceed image size - 4', () => {
    const result = adaptModelLocateResultToRect([25, 154, 153, 186], {
      width: 301,
      height: 164,
      modelFamily: 'qwen2.5-vl',
      bounds: {
        width: 140,
        height: 160,
      },
      mapping: {
        offset: { x: 0, y: 752 },
        scale: 1,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 7,
        "left": 25,
        "top": 906,
        "width": 116,
      }
    `);
  });
});

describe('doubao-vision', () => {
  it('normalizes doubao bbox coordinates', () => {
    const result = normalizeWithModel(
      'doubao-vision',
      [100, 200, 300, 400],
      400,
      900,
    );
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });

  it('normalizes doubao bbox with space-separated point strings', () => {
    const result = normalizeWithModel(
      'doubao-vision',
      ['123 222', '789 100'],
      1000,
      2000,
    );
    expect(result).toMatchInlineSnapshot(`
      [
        123,
        444,
        789,
        200,
      ]
    `);
  });

  it('normalizes doubao bbox with comma-separated point strings', () => {
    const result = normalizeWithModel(
      'doubao-vision',
      ['123,222', '789, 100'],
      1000,
      2000,
    );
    expect(result).toMatchInlineSnapshot(`
      [
        123,
        444,
        789,
        200,
      ]
    `);
  });
});

describe('doubao target adapter normalization', () => {
  it('flattens single nested doubao bbox', () => {
    const locateAdapter = getModelAdapter('doubao-vision').locate;
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }
    const grounding = locateAdapter.resultAdapter;
    const result = grounding.normalizeResultToPixelBbox(
      grounding.resolveLocateResult([[100, 200, 300, 400]] as any),
      { width: 400, height: 900 },
    );
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });

  it('flattens nested doubao bbox list by taking the first entry', () => {
    const locateAdapter = getModelAdapter('doubao-vision').locate;
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }
    const grounding = locateAdapter.resultAdapter;
    const result = grounding.normalizeResultToPixelBbox(
      grounding.resolveLocateResult([
        [100, 200, 300, 400],
        [100, 200, 300, 400],
      ] as any),
      { width: 400, height: 900 },
    );
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });
});

describe('doubao-vision', () => {
  it('repairs bbox coordinate strings through its json parser', () => {
    const parser = getModelAdapter('doubao-vision').jsonParser;
    expect(parser('{"bbox": [123 456]}')).toEqual({ bbox: [123, 456] });
    expect(parser('{"bbox": [1 4]}')).toEqual({ bbox: [1, 4] });
    expect(parser('{"bbox": [123 456,789 100]}')).toEqual({
      bbox: [123, 456, 789, 100],
    });
    expect(parser('{"bbox": [940 445 969 490]}')).toEqual({
      bbox: [940, 445, 969, 490],
    });
    expect(() => parser('123 345 11111')).toThrow();

    const input = `
{
  "bbox": [
    "550 216",
    "550 216",
    "550 216",
    "550 216"
  ],
  "errors": []
}
    `;
    expect(parser(input)).toEqual({
      bbox: ['550 216', '550 216', '550 216', '550 216'],
      errors: [],
    });
  });

  it('normalizes doubao point fallback', () => {
    const result = normalizeWithModel('doubao-vision', [100, 200], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        90,
        390,
        110,
        410,
      ]
    `);
  });

  it('normalizes doubao bbox', () => {
    const result = normalizeWithModel(
      'doubao-vision',
      [100, 200, 300, 400],
      1000,
      2000,
    );
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        400,
        300,
        800,
      ]
    `);
  });

  it('normalizes doubao malformed six-number point fallback', () => {
    const result2 = normalizeWithModel(
      'doubao-vision',
      [100, 200, 300, 400, 100, 200],
      1000,
      2000,
    );
    expect(result2).toMatchInlineSnapshot(`
      [
        90,
        390,
        110,
        410,
      ]
    `);
  });

  it('normalizes doubao polygon bbox', () => {
    const result3 = normalizeWithModel(
      'doubao-vision',
      [100, 200, 300, 200, 300, 400, 100, 400],
      1000,
      2000,
    );
    expect(result3).toMatchInlineSnapshot(`
      [
        100,
        400,
        300,
        800,
      ]
    `);
  });

  it('throws on invalid doubao bbox data', () => {
    expect(() =>
      normalizeWithModel('doubao-vision', [100], 1000, 2000),
    ).toThrow();
  });
});

describe('normalized-0-1000 and gemini', () => {
  it('normalized-0-1000', () => {
    const result = mapNormalized01000XyxyToActualPixelBbox(
      [100, 150, 200, 250],
      2000,
      2000,
    );
    expect(result).toMatchInlineSnapshot(`
      [
        200,
        300,
        400,
        500,
      ]
    `);
  });

  it('gemini', () => {
    const result = normalizeWithModel(
      'gemini',
      [100, 150, 200, 250],
      2000,
      2000,
    );
    expect(result).toMatchInlineSnapshot(`
      [
        300,
        200,
        500,
        400,
      ]
    `);
  });
});

describe('adaptModelLocateResultToRect - boundary overflow cases', () => {
  it('should handle x1 overflow (negative left)', () => {
    const result = adaptModelLocateResultToRect([-100, 200, 300, 400], {
      width: 2000,
      height: 3000,
      modelFamily: 'glm-v',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 601,
        "left": 0,
        "top": 600,
        "width": 601,
      }
    `);
  });

  it('should handle y1 overflow (negative top)', () => {
    const result = adaptModelLocateResultToRect([200, -100, 400, 300], {
      width: 2000,
      height: 3000,
      modelFamily: 'glm-v',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 901,
        "left": 400,
        "top": 0,
        "width": 401,
      }
    `);
  });

  it('should handle x2 overflow (right exceeds width)', () => {
    const result = adaptModelLocateResultToRect([600, 200, 1200, 400], {
      width: 2000,
      height: 3000,
      modelFamily: 'glm-v',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 601,
        "left": 1200,
        "top": 600,
        "width": 801,
      }
    `);
  });

  it('should handle y2 overflow (bottom exceeds height)', () => {
    const result = adaptModelLocateResultToRect([200, 600, 400, 1200], {
      width: 2000,
      height: 3000,
      modelFamily: 'glm-v',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 1201,
        "left": 400,
        "top": 1800,
        "width": 401,
      }
    `);
  });

  it('should clamp bbox fully inside right padding to content bounds', () => {
    const result = adaptModelLocateResultToRect([1100, 100, 1190, 200], {
      width: 1200,
      height: 1000,
      modelFamily: 'qwen2.5-vl',
      bounds: {
        width: 1000,
        height: 1000,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 101,
        "left": 1000,
        "top": 100,
        "width": 1,
      }
    `);
  });

  it('should clamp bbox fully inside bottom padding to content bounds', () => {
    const result = adaptModelLocateResultToRect([100, 1100, 200, 1190], {
      width: 1000,
      height: 1200,
      modelFamily: 'qwen2.5-vl',
      bounds: {
        width: 1000,
        height: 1000,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 1,
        "left": 100,
        "top": 1000,
        "width": 101,
      }
    `);
  });
});

describe('adaptModelLocateResultToRect - with scale parameter', () => {
  it('should work without scale (scale = 1)', () => {
    const result = adaptModelLocateResultToRect([100, 200, 300, 400], {
      width: 1000,
      height: 1000,
      modelFamily: 'qwen2.5-vl',
      mapping: {
        offset: { x: 0, y: 0 },
        scale: 1,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 201,
        "left": 100,
        "top": 200,
        "width": 201,
      }
    `);
  });

  it('should scale down by 2 (scale = 2)', () => {
    const result = adaptModelLocateResultToRect([200, 400, 600, 800], {
      width: 2000,
      height: 2000,
      modelFamily: 'qwen2.5-vl',
      mapping: {
        offset: { x: 0, y: 0 },
        scale: 2,
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "height": 201,
        "left": 100,
        "top": 200,
        "width": 201,
      }
    `);
  });

  it('should scale down by 1.5 (scale = 1.5)', () => {
    const result = adaptModelLocateResultToRect([150, 300, 450, 600], {
      width: 1500,
      height: 1500,
      modelFamily: 'qwen2.5-vl',
      mapping: {
        offset: { x: 0, y: 0 },
        scale: 1.5,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 201,
        "left": 100,
        "top": 200,
        "width": 201,
      }
    `);
  });

  it('should handle scale with offset', () => {
    // Scaled 2x image with offset
    const result = adaptModelLocateResultToRect([200, 400, 600, 800], {
      width: 2000,
      height: 2000,
      modelFamily: 'qwen2.5-vl',
      mapping: {
        offset: { x: 100, y: 150 },
        scale: 2,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 201,
        "left": 200,
        "top": 350,
        "width": 201,
      }
    `);
  });

  it('should work with different model families and scale', () => {
    // Test with qwen2.5-vl model and scale = 2
    const result = adaptModelLocateResultToRect([200, 400, 600, 800], {
      width: 2000,
      height: 2000,
      modelFamily: 'qwen2.5-vl',
      bounds: {
        width: 2000,
        height: 2000,
      },
      mapping: {
        offset: { x: 0, y: 0 },
        scale: 2,
      },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 201,
        "left": 100,
        "top": 200,
        "width": 201,
      }
    `);
  });
});
