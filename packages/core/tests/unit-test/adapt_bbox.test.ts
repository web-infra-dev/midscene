import { preprocessDoubaoBboxJson } from '@/ai-model/service-caller';
import {
  adaptBbox,
  adaptBboxToRect,
  adaptDoubaoBbox,
  adaptGeminiBbox,
  adaptQwen2_5Bbox as adaptQwenBbox,
  normalized01000,
} from '@/common';

import { describe, expect, it } from 'vitest';

describe('qwen-vl-2.5', () => {
  it('adaptQwenBbox', () => {
    const result = adaptQwenBbox([100.3, 200.4, 301, 401]);
    expect(result).toEqual([100, 200, 301, 401]);
  });

  it('adaptQwenBbox with 2 points', () => {
    const result = adaptQwenBbox([100, 200]);
    expect(result).toEqual([100, 200, 120, 220]);
  });

  it('adaptQwenBbox with invalid bbox data', () => {
    expect(() => adaptQwenBbox([100])).toThrow();
  });

  it('adaptBboxToRect - size exceed image size', () => {
    const result = adaptBboxToRect([100, 200, 1000, 2000], 1000, 1000);
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 801,
        "left": 100,
        "top": 200,
        "width": 901,
      }
    `);
  });

  it('adaptBboxToRect - size exceed image size - 2', () => {
    const result = adaptBboxToRect(
      [158, 114, 526, 179],
      684,
      301,
      611,
      221,
      684,
      301,
      'qwen2.5-vl',
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 66,
        "left": 769,
        "top": 335,
        "width": 369,
      }
    `);
  });

  it('adaptBboxToRect - size exceed image size - 3', () => {
    const result = adaptBboxToRect(
      [25, 154, 153, 186],
      301,
      164,
      0,
      752,
      301,
      164,
      'qwen2.5-vl',
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 11,
        "left": 25,
        "top": 906,
        "width": 129,
      }
    `);
  });

  it('adaptBboxToRect - size exceed image size - 4', () => {
    const result = adaptBboxToRect(
      [25, 154, 153, 186],
      301,
      164,
      0,
      752,
      140,
      160,
      'qwen2.5-vl',
    );
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
  it('adaptDoubaoBbox', () => {
    const result = adaptDoubaoBbox([100, 200, 300, 400], 400, 900);
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });

  it('adaptDoubaoBbox with string bbox', () => {
    const result = adaptDoubaoBbox(['123 222', '789 100'], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        123,
        444,
        789,
        200,
      ]
    `);
  });

  it('adaptDoubaoBbox with string bbox', () => {
    const result = adaptDoubaoBbox(['123,222', '789, 100'], 1000, 2000);
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

describe('adaptBbox - doubao normalization', () => {
  it('flattens single nested doubao bbox', () => {
    const result = adaptBbox(
      [[100, 200, 300, 400]] as any,
      400,
      900,
      'doubao-vision',
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
    const result = adaptBbox(
      [
        [100, 200, 300, 400],
        [100, 200, 300, 400],
      ] as any,
      400,
      900,
      'doubao-vision',
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
  it('preprocessDoubaoBboxJson', () => {
    const input = 'bbox: [123 456]';
    const result = preprocessDoubaoBboxJson(input);
    expect(result).toMatchInlineSnapshot(`"bbox: [123,456]"`);

    const input2 = 'bbox: [1 4]';
    const result2 = preprocessDoubaoBboxJson(input2);
    expect(result2).toMatchInlineSnapshot(`"bbox: [1,4]"`);

    const input3 = 'bbox: [123 456]\nbbox: [789 100]';
    const result3 = preprocessDoubaoBboxJson(input3);
    expect(result3).toMatchInlineSnapshot(`
      "bbox: [123,456]
      bbox: [789,100]"
    `);

    const input4 = 'bbox: [123 456,789 100]';
    const result4 = preprocessDoubaoBboxJson(input4);
    expect(result4).toMatchInlineSnapshot(`"bbox: [123,456,789,100]"`);

    const input5 = 'bbox: [940 445 969 490]';
    const result5 = preprocessDoubaoBboxJson(input5);
    expect(result5).toMatchInlineSnapshot(`"bbox: [940,445,969,490]"`);

    const input6 = '123 345 11111';
    const result6 = preprocessDoubaoBboxJson(input6);
    expect(result6).toMatchInlineSnapshot(`"123 345 11111"`);

    const input7 = `
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
    const result7 = preprocessDoubaoBboxJson(input7);
    expect(result7).toMatchInlineSnapshot(`
      "
      {
        "bbox": [
          "550,216",
          "550,216",
          "550,216",
          "550,216"
        ],
        "errors": []
      }
          "
    `);
  });

  it('adaptDoubaoBbox with 2 points', () => {
    const result = adaptDoubaoBbox([100, 200], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        90,
        390,
        110,
        410,
      ]
    `);
  });

  it('adaptDoubaoBbox', () => {
    const result = adaptDoubaoBbox([100, 200, 300, 400], 1000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        400,
        300,
        800,
      ]
    `);
  });

  it('adaptDoubaoBbox with 6 points', () => {
    const result2 = adaptDoubaoBbox([100, 200, 300, 400, 100, 200], 1000, 2000);
    expect(result2).toMatchInlineSnapshot(`
      [
        90,
        390,
        110,
        410,
      ]
    `);
  });

  it('adaptDoubaoBbox with 8 points', () => {
    const result3 = adaptDoubaoBbox(
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

  it('adaptDoubaoBbox with invalid bbox data', () => {
    expect(() => adaptDoubaoBbox([100], 1000, 2000)).toThrow();
  });
});

describe('normalized-0-1000 and gemini', () => {
  it('normalized-0-1000', () => {
    const result = normalized01000([100, 150, 200, 250], 2000, 2000);
    expect(result).toMatchInlineSnapshot(`
      [
        200,
        300,
        400,
        500,
      ]
    `);
  });

  it('normalized-0-1000 throws with model family context', () => {
    expect(() =>
      normalized01000([0, 500, 1080, 1920], 720, 1600, 'qwen3.6'),
    ).toThrowError(/outside the expected \[0, 1000\] normalized range/);
  });

  it('gemini', () => {
    const result = adaptGeminiBbox([100, 150, 200, 250], 2000, 2000);
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

describe('adaptBbox - normalized [0, 1000] range guard', () => {
  it('accepts an in-range bbox for qwen3.6', () => {
    const result = adaptBbox([100, 200, 300, 400], 720, 1600, 'qwen3.6');
    expect(result).toEqual([72, 320, 216, 640]);
  });

  it('accepts an in-range bbox for qwen3', () => {
    const result = adaptBbox([100, 200, 300, 400], 720, 1600, 'qwen3');
    expect(result).toEqual([72, 320, 216, 640]);
  });

  it('accepts boundary values 0 and 1000', () => {
    const result = adaptBbox([0, 0, 1000, 1000], 720, 1600, 'qwen3-vl');
    expect(result).toEqual([0, 0, 720, 1600]);
  });

  it('throws when a coordinate exceeds 1000 (real qwen3.6 failure case)', () => {
    // Observed in the wild: tongyi/qwen3.6-plus emitted pixel-style coords
    // [0, 500, 1080, 1920] against a 720x1600 shot, which propagated to an
    // off-screen ADB swipe.
    expect(() =>
      adaptBbox([0, 500, 1080, 1920], 720, 1600, 'qwen3.6'),
    ).toThrowError(/outside the expected \[0, 1000\] normalized range/);
  });

  it('error message includes the model family, the raw bbox, and shotSize', () => {
    try {
      adaptBbox([0, 500, 1080, 1920], 720, 1600, 'qwen3.6');
      throw new Error('expected adaptBbox to throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('qwen3.6');
      expect(msg).toContain('[0,500,1080,1920]');
      expect(msg).toContain('shotSize=720x1600');
      expect(msg).toContain('MIDSCENE_MODEL_FAMILY');
    }
  });

  it('throws on negative coordinates', () => {
    expect(() =>
      adaptBbox([-1, 200, 300, 400], 720, 1600, 'qwen3.5'),
    ).toThrowError(/outside the expected \[0, 1000\] normalized range/);
  });

  it('throws on non-finite coordinates (NaN)', () => {
    expect(() =>
      adaptBbox([Number.NaN, 200, 300, 400], 720, 1600, 'glm-v'),
    ).toThrowError(/outside the expected \[0, 1000\] normalized range/);
  });

  it('throws on a non-array bbox payload', () => {
    expect(() =>
      adaptBbox('not-a-bbox' as any, 720, 1600, 'auto-glm'),
    ).toThrowError(/non-array bbox for the normalized \[0, 1000\] format/);
  });

  it('does not validate range for families that own their own coordinate format', () => {
    // qwen2.5-vl uses raw pixel coords and must keep working with values > 1000.
    expect(() =>
      adaptBbox([0, 500, 1080, 1920], 720, 1600, 'qwen2.5-vl'),
    ).not.toThrow();
  });
});

describe('adaptBboxToRect - boundary overflow cases', () => {
  it('should handle x1 overflow (negative left)', () => {
    const result = adaptBboxToRect([-100, 200, 300, 400], 2000, 3000);
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
    const result = adaptBboxToRect([200, -100, 400, 300], 2000, 3000);
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
    const result = adaptBboxToRect([600, 200, 1200, 400], 2000, 3000);
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
    const result = adaptBboxToRect([200, 600, 400, 1200], 2000, 3000);
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 1201,
        "left": 400,
        "top": 1800,
        "width": 401,
      }
    `);
  });
});

describe('adaptBboxToRect - with scale parameter', () => {
  it('should work without scale (scale = 1)', () => {
    const result = adaptBboxToRect(
      [100, 200, 300, 400],
      1000,
      1000,
      0,
      0,
      undefined,
      undefined,
      undefined,
      1,
    );
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
    const result = adaptBboxToRect(
      [200, 400, 600, 800],
      2000,
      2000,
      0,
      0,
      undefined,
      undefined,
      undefined,
      2,
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "height": 401,
        "left": 200,
        "top": 400,
        "width": 401,
      }
    `);
  });

  it('should scale down by 1.5 (scale = 1.5)', () => {
    const result = adaptBboxToRect(
      [150, 300, 450, 600],
      1500,
      1500,
      0,
      0,
      undefined,
      undefined,
      undefined,
      1.5,
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 301,
        "left": 150,
        "top": 300,
        "width": 301,
      }
    `);
  });

  it('should handle scale with offset', () => {
    // Scaled 2x image with offset
    const result = adaptBboxToRect(
      [200, 400, 600, 800],
      2000,
      2000,
      100, // offsetX
      150, // offsetY
      undefined,
      undefined,
      undefined,
      2,
    );
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 401,
        "left": 300,
        "top": 550,
        "width": 401,
      }
    `);
  });

  it('should work with different model families and scale', () => {
    // Test with qwen2.5-vl model and scale = 2
    const result = adaptBboxToRect(
      [200, 400, 600, 800],
      2000,
      2000,
      0,
      0,
      2000,
      2000,
      'qwen2.5-vl',
      2,
    );
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
