import { describe, expect, it } from 'vitest';
import { generateElementByRect } from '../../src/extractor/dom-util';

describe('generateElementByRect', () => {
  it('should calculate center and rect for even width and height', () => {
    const result = generateElementByRect(
      { left: 10, top: 20, width: 6, height: 6 },
      'test element',
    );

    // Center should be at (12, 22) - the top-left of four center pixels
    expect(result.center).toEqual([12, 22]);
    expect(result.rect).toEqual({
      left: 9,
      top: 19,
      width: 8,
      height: 8,
    });
    expect(result.description).toBe('test element');
  });

  it('should calculate center and rect for odd width and height', () => {
    const result = generateElementByRect(
      { left: 10, top: 20, width: 5, height: 5 },
      '',
    );

    // Center should be at (12, 22) - the exact middle pixel
    expect(result.center).toEqual([12, 22]);
    expect(result.rect).toEqual({
      left: 9,
      top: 19,
      width: 8,
      height: 8,
    });
  });

  it('should handle rect at origin (0, 0)', () => {
    const result = generateElementByRect(
      { left: 0, top: 0, width: 10, height: 10 },
      '',
    );

    // Center should be at (4, 4)
    expect(result.center).toEqual([4, 4]);
    expect(result.rect).toEqual({
      left: 1,
      top: 1,
      width: 8,
      height: 8,
    });
  });

  it('should handle large rect', () => {
    const result = generateElementByRect(
      { left: 100, top: 200, width: 100, height: 100 },
      '',
    );

    // Center should be at (149, 249)
    expect(result.center).toEqual([149, 249]);
    expect(result.rect).toEqual({
      left: 146,
      top: 246,
      width: 8,
      height: 8,
    });
  });

  it('should handle rect with width and height of 1', () => {
    const result = generateElementByRect(
      { left: 50, top: 60, width: 1, height: 1 },
      '',
    );

    // Center should be at (50, 60)
    expect(result.center).toEqual([50, 60]);
    expect(result.rect).toEqual({
      left: 47,
      top: 57,
      width: 8,
      height: 8,
    });
  });

  it('should handle custom edgeSize', () => {
    const result = generateElementByRect(
      { left: 10, top: 20, width: 10, height: 10 },
      '',
      4,
    );

    // Center should be at (14, 24)
    expect(result.center).toEqual([14, 24]);
    expect(result.rect).toEqual({
      left: 13,
      top: 23,
      width: 4,
      height: 4,
    });
  });

  it('should handle rect near edge with center clamping to 0', () => {
    const result = generateElementByRect(
      { left: 1, top: 1, width: 2, height: 2 },
      '',
    );

    // Center should be at (1, 1)
    expect(result.center).toEqual([1, 1]);
    // Rect should be clamped to not go below 0
    expect(result.rect).toEqual({
      left: 0,
      top: 0,
      width: 8,
      height: 8,
    });
  });

  it('should handle rect with different width and height', () => {
    const result = generateElementByRect(
      { left: 10, top: 20, width: 8, height: 4 },
      '',
    );

    // Center should be at (13, 21)
    expect(result.center).toEqual([13, 21]);
    expect(result.rect).toEqual({
      left: 10,
      top: 18,
      width: 8,
      height: 8,
    });
  });

  it('should handle odd edgeSize', () => {
    const result = generateElementByRect(
      { left: 10, top: 20, width: 10, height: 10 },
      '',
      5,
    );

    // Center should be at (14, 24)
    expect(result.center).toEqual([14, 24]);
    expect(result.rect).toEqual({
      left: 12,
      top: 22,
      width: 5,
      height: 5,
    });
  });

  it('should handle large even width and height', () => {
    const result = generateElementByRect(
      { left: 0, top: 0, width: 1000, height: 1000 },
      '',
    );

    // Center should be at (499, 499)
    expect(result.center).toEqual([499, 499]);
    expect(result.rect).toEqual({
      left: 496,
      top: 496,
      width: 8,
      height: 8,
    });
  });

  it('a real case', () => {
    const [x1, y1, x2, y2] = [934, 93, 951, 118];
    const [imgW, imgH] = [1280, 860];

    const left = Math.round((x1 / 1000) * imgW);
    const top = Math.round((y1 / 1000) * imgH);
    const width = Math.round(((x2 - x1) / 1000) * imgW);
    const height = Math.round(((y2 - y1) / 1000) * imgH);

    expect({
      left,
      top,
      width,
      height,
    }).toMatchInlineSnapshot(`
      {
        "height": 22,
        "left": 1196,
        "top": 80,
        "width": 22,
      }
    `);

    const result = generateElementByRect(
      { left, top, width, height },
      'real case',
      8,
    );

    // The result under the old version's calculation logic was 1206.5, 90.5
    expect(result.center).toEqual([1206, 90]);

    // The result based on model bbox without adaptToRect
    expect(((x1 + x2) / 2 / 1000) * imgW).toBe(1206.4);
    expect(((y1 + y2) / 2 / 1000) * imgH).toBe(90.73);

    expect(result.rect).toEqual({
      left: 1203,
      top: 87,
      width: 8,
      height: 8,
    });
  });
});
