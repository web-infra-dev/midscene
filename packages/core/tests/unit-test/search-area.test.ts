import { describe, expect, it } from 'vitest';

import { expandSearchArea, mergeRects } from '@/common';

it('mergeRects', () => {
  const result = mergeRects([
    { left: 10, top: 10, width: 10, height: 500 },
    { left: 100, top: 100, width: 100, height: 100 },
  ]);
  expect(result).toMatchInlineSnapshot(`
      {
        "height": 500,
        "left": 10,
        "top": 10,
        "width": 190,
      }
    `);
});

describe('expandSearchArea', () => {
  it('should expand small centered rect (requires both steps)', () => {
    // 50x50 rect at center, screen 1000x1000
    const result = expandSearchArea(
      { left: 500, top: 500, width: 50, height: 50 },
      { width: 1000, height: 1000 },
    );

    // Step 1: expand 100px each side -> {left: 400, top: 400, width: 250, height: 250}
    // Area = 62,500 < 160,000, needs step 2
    // Step 2: scale to 400x400 from center (525, 525)
    expect(result).toEqual({
      left: 325,
      top: 325,
      width: 400,
      height: 400,
    });
  });

  it('should only apply step 1 when area is already >= 400x400', () => {
    // 300x300 rect, after step 1 will be 500x500
    const result = expandSearchArea(
      { left: 500, top: 500, width: 300, height: 300 },
      { width: 2000, height: 2000 },
    );

    // Step 1: expand 100px each side -> {left: 400, top: 400, width: 500, height: 500}
    // Area = 250,000 >= 160,000, no step 2 needed
    expect(result).toEqual({
      left: 400,
      top: 400,
      width: 500,
      height: 500,
    });
  });

  it('should handle element at left boundary', () => {
    const result = expandSearchArea(
      { left: 10, top: 500, width: 50, height: 50 },
      { width: 1000, height: 1000 },
    );

    // Step 1: left can only expand 10px (10-100 clamped to 0)
    // {left: 0, top: 400, width: 160, height: 250}
    // Area = 40,000 < 160,000, needs step 2
    // Step 2: center (80, 525), scale factor = 2.0, new size = 320x500
    // New position from center: (80-160, 525-250) = (-80, 275) -> clamped to (0, 275)
    // Final: left=0 (clamped), width=320, but height exceeds so it's 500
    expect(result.left).toBe(0);
    expect(result.top).toBe(275);
    expect(result.width).toBe(320);
    expect(result.height).toBe(500);
  });

  it('should handle element at right boundary', () => {
    const result = expandSearchArea(
      { left: 940, top: 500, width: 50, height: 50 },
      { width: 1000, height: 1000 },
    );

    // Step 1: right can only expand 10px (original right 990, desired 1090, clamped to 1000)
    // {left: 840, top: 400, width: 160, height: 250}
    // Area = 40,000 < 160,000, needs step 2
    // Step 2: center (920, 525), scale factor = 2.0, new size = 320x500
    // New position from center: (920-160, 525-250) = (760, 275)
    // Final: width limited by right boundary (1000-760=240)
    expect(result.left).toBe(760);
    expect(result.top).toBe(275);
    expect(result.width).toBe(240);
    expect(result.height).toBe(500);
  });

  it('should handle element at top boundary', () => {
    const result = expandSearchArea(
      { left: 500, top: 10, width: 50, height: 50 },
      { width: 1000, height: 1000 },
    );

    // Step 1: top can only expand 10px (10-100 clamped to 0)
    // {left: 400, top: 0, width: 250, height: 160}
    // Area = 40,000 < 160,000, needs step 2
    // Step 2: center (525, 80), scale factor = 2.0, new size = 500x320
    // New position from center: (525-250, 80-160) = (275, -80) -> clamped to (275, 0)
    // Final: top=0 (clamped), height=320
    expect(result.left).toBe(275);
    expect(result.top).toBe(0);
    expect(result.width).toBe(500);
    expect(result.height).toBe(320);
  });

  it('should handle element at bottom boundary', () => {
    const result = expandSearchArea(
      { left: 500, top: 940, width: 50, height: 50 },
      { width: 1000, height: 1000 },
    );

    // Step 1: bottom can only expand 10px (original bottom 990, desired 1090, clamped to 1000)
    // {left: 400, top: 840, width: 250, height: 160}
    // Area = 40,000 < 160,000, needs step 2
    // Step 2: center (525, 920), scale factor = 2.0, new size = 500x320
    // New position from center: (525-250, 920-160) = (275, 760)
    // Final: height limited by bottom boundary (1000-760=240)
    expect(result.left).toBe(275);
    expect(result.top).toBe(760);
    expect(result.width).toBe(500);
    expect(result.height).toBe(240);
  });

  it('should handle element at top-left corner', () => {
    const result = expandSearchArea(
      { left: 10, top: 10, width: 30, height: 30 },
      { width: 1000, height: 1000 },
    );

    // Both left and top limited by boundaries
    // After expansion and scaling, should be pushed to corner
    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
    expect(result.width).toBe(400);
    expect(result.height).toBe(400);
  });

  it('should handle element at bottom-right corner', () => {
    const result = expandSearchArea(
      { left: 960, top: 960, width: 30, height: 30 },
      { width: 1000, height: 1000 },
    );

    // Both right and bottom limited
    expect(result.left).toBe(730);
    expect(result.top).toBe(730);
    expect(result.width).toBe(270);
    expect(result.height).toBe(270);
  });

  it('should handle very small screen (cannot fit 400x400)', () => {
    const result = expandSearchArea(
      { left: 50, top: 50, width: 50, height: 50 },
      { width: 300, height: 300 },
    );

    // Screen is only 300x300, can't achieve 400x400
    // Should expand to screen size
    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
    expect(result.width).toBe(300);
    expect(result.height).toBe(300);
  });

  it('should handle rect larger than minimum size', () => {
    const result = expandSearchArea(
      { left: 200, top: 200, width: 600, height: 600 },
      { width: 1920, height: 1080 },
    );

    // Step 1: {left: 100, top: 100, width: 800, height: 800}
    // Already > 400x400, no step 2
    expect(result).toEqual({
      left: 100,
      top: 100,
      width: 800,
      height: 800,
    });
  });

  it('should handle exact minimum area case', () => {
    // After step 1, area is exactly 160,000
    const result = expandSearchArea(
      { left: 500, top: 500, width: 200, height: 200 },
      { width: 2000, height: 2000 },
    );

    // Step 1: {left: 400, top: 400, width: 400, height: 400}
    // Area = 160,000 exactly, should return without step 2
    expect(result).toEqual({
      left: 400,
      top: 400,
      width: 400,
      height: 400,
    });
  });

  it('should handle thin horizontal element', () => {
    const result = expandSearchArea(
      { left: 300, top: 500, width: 200, height: 20 },
      { width: 1000, height: 1000 },
    );

    // Step 1: {left: 200, top: 400, width: 400, height: 220}
    // Area = 88,000 < 160,000, needs step 2
    const area = result.width * result.height;
    expect(area).toBeGreaterThanOrEqual(160000);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left + result.width).toBeLessThanOrEqual(1000);
    expect(result.top + result.height).toBeLessThanOrEqual(1000);
  });

  it('should handle thin vertical element', () => {
    const result = expandSearchArea(
      { left: 500, top: 300, width: 20, height: 200 },
      { width: 1000, height: 1000 },
    );

    // Step 1: {left: 400, top: 200, width: 220, height: 400}
    // Area = 88,000 < 160,000, needs step 2
    const area = result.width * result.height;
    expect(area).toBeGreaterThanOrEqual(160000);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left + result.width).toBeLessThanOrEqual(1000);
    expect(result.top + result.height).toBeLessThanOrEqual(1000);
  });
});
