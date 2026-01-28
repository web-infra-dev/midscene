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
