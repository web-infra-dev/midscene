import { createLocateResultAdapter } from '@/ai-model/shared/model-locate-result';
import { pixelBboxToRect } from '@/ai-model/workflows/inspect/locate-result-rect';
import { mapSearchAreaPixelBboxToOriginalPixelBbox } from '@/ai-model/workflows/inspect/search-area-mapping';
import { describe, expect, it } from 'vitest';

const actualPixelBboxAdapter = createLocateResultAdapter({
  coordinates: { shape: 'bbox', order: 'xy' },
});

function adaptElementLocateResultToRect(
  input: unknown,
  context: {
    preparedSize: { width: number; height: number };
    contentSize?: { width: number; height: number };
  },
) {
  return pixelBboxToRect(
    actualPixelBboxAdapter.adaptElementLocateResultToPixelBbox(input, context),
  );
}

describe('adaptElementLocateResultToPixelBbox - boundary overflow cases', () => {
  it('throws on x1 overflow (negative left)', () => {
    expect(() =>
      actualPixelBboxAdapter.adaptElementLocateResultToPixelBbox(
        [-100, 200, 300, 400],
        { preparedSize: { width: 2000, height: 3000 } },
      ),
    ).toThrow(/exceed image size/);
  });

  it('throws on y1 overflow (negative top)', () => {
    expect(() =>
      actualPixelBboxAdapter.adaptElementLocateResultToPixelBbox(
        [200, -100, 400, 300],
        { preparedSize: { width: 2000, height: 3000 } },
      ),
    ).toThrow(/exceed image size/);
  });

  it('throws on x2 overflow (right exceeds width)', () => {
    expect(() =>
      actualPixelBboxAdapter.adaptElementLocateResultToPixelBbox(
        [1600, 200, 2200, 400],
        { preparedSize: { width: 2000, height: 3000 } },
      ),
    ).toThrow(/exceed image size/);
  });

  it('throws on y2 overflow (bottom exceeds height)', () => {
    expect(() =>
      actualPixelBboxAdapter.adaptElementLocateResultToPixelBbox(
        [200, 2600, 400, 3200],
        { preparedSize: { width: 2000, height: 3000 } },
      ),
    ).toThrow(/exceed image size/);
  });

  it('throws before clamping to content size when bbox exceeds image size', () => {
    expect(() =>
      actualPixelBboxAdapter.adaptElementLocateResultToPixelBbox(
        [25, 154, 153, 186],
        {
          preparedSize: { width: 301, height: 164 },
          contentSize: { width: 140, height: 160 },
        },
      ),
    ).toThrow(/exceed image size/);
  });

  it('clamps bbox fully inside right padding to content size', () => {
    const result = adaptElementLocateResultToRect([1100, 100, 1190, 200], {
      preparedSize: { width: 1200, height: 1000 },
      contentSize: { width: 1000, height: 1000 },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 101,
        "left": 999,
        "top": 100,
        "width": 1,
      }
    `);
  });

  it('clamps bbox fully inside bottom padding to content size', () => {
    const result = adaptElementLocateResultToRect([100, 1100, 200, 1190], {
      preparedSize: { width: 1000, height: 1200 },
      contentSize: { width: 1000, height: 1000 },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "height": 1,
        "left": 100,
        "top": 999,
        "width": 101,
      }
    `);
  });
});

describe('mapSearchAreaPixelBboxToOriginalPixelBbox', () => {
  it('works without explicit scale', () => {
    const result = mapSearchAreaPixelBboxToOriginalPixelBbox([
      100, 200, 300, 400,
    ]);
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        200,
        300,
        400,
      ]
    `);
  });

  it('works with scale = 1', () => {
    const result = mapSearchAreaPixelBboxToOriginalPixelBbox(
      [100, 200, 300, 400],
      {
        offset: { x: 0, y: 0 },
        scale: 1,
      },
    );
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        200,
        300,
        400,
      ]
    `);
  });

  it('scales down by 2', () => {
    const result = mapSearchAreaPixelBboxToOriginalPixelBbox(
      [200, 400, 600, 800],
      {
        offset: { x: 0, y: 0 },
        scale: 2,
      },
    );

    expect(result).toMatchInlineSnapshot(`
      [
        100,
        200,
        300,
        400,
      ]
    `);
  });

  it('scales down by 1.5', () => {
    const result = mapSearchAreaPixelBboxToOriginalPixelBbox(
      [150, 300, 450, 600],
      {
        offset: { x: 0, y: 0 },
        scale: 1.5,
      },
    );
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        200,
        300,
        400,
      ]
    `);
  });

  it('applies offset after scaling', () => {
    const result = mapSearchAreaPixelBboxToOriginalPixelBbox(
      [200, 400, 600, 800],
      {
        offset: { x: 100, y: 150 },
        scale: 2,
      },
    );
    expect(result).toMatchInlineSnapshot(`
      [
        200,
        350,
        400,
        550,
      ]
    `);
  });
});
