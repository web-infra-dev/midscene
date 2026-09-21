import { createLocateResultCodec } from '@/ai-model/shared/model-locate-result';
import { describe, expect, it } from '@rstest/core';

const actualPixelBboxAdapter = createLocateResultCodec({
  coordinates: { shape: 'bbox', order: 'xy' },
});

function adaptElementLocateResultToRect(
  input: unknown,
  context: {
    preparedSize: { width: number; height: number };
    contentSize?: { width: number; height: number };
  },
) {
  return actualPixelBboxAdapter.toPixelResult(input, context).rect;
}

describe('toPixelResult - boundary overflow cases', () => {
  it('throws on x1 overflow (negative left)', () => {
    expect(
      () =>
        actualPixelBboxAdapter.toPixelResult([-100, 200, 300, 400], {
          preparedSize: { width: 2000, height: 3000 },
        }).rect,
    ).toThrow(/exceed image size/);
  });

  it('throws on y1 overflow (negative top)', () => {
    expect(
      () =>
        actualPixelBboxAdapter.toPixelResult([200, -100, 400, 300], {
          preparedSize: { width: 2000, height: 3000 },
        }).rect,
    ).toThrow(/exceed image size/);
  });

  it('throws on x2 overflow (right exceeds width)', () => {
    expect(
      () =>
        actualPixelBboxAdapter.toPixelResult([1600, 200, 2200, 400], {
          preparedSize: { width: 2000, height: 3000 },
        }).rect,
    ).toThrow(/exceed image size/);
  });

  it('throws on y2 overflow (bottom exceeds height)', () => {
    expect(
      () =>
        actualPixelBboxAdapter.toPixelResult([200, 2600, 400, 3200], {
          preparedSize: { width: 2000, height: 3000 },
        }).rect,
    ).toThrow(/exceed image size/);
  });

  it('throws before clamping to content size when bbox exceeds image size', () => {
    expect(
      () =>
        actualPixelBboxAdapter.toPixelResult([25, 154, 153, 186], {
          preparedSize: { width: 301, height: 164 },
          contentSize: { width: 140, height: 160 },
        }).rect,
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
