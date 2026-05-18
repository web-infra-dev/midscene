import { createLocateResultAdapter } from '@/ai-model/shared/model-locate-result';
import { describe, expect, it, vi } from 'vitest';

describe('createLocateResultAdapter', () => {
  it('uses bbox/bbox_2d extraction and normalized xyxy mapping by default', () => {
    const adapter = createLocateResultAdapter({
      format: 'bbox-normalized-0-1000-xyxy',
    });

    const rawResult = adapter.extractRawLocateResult({
      bbox_2d: [100, 200, 300, 400],
    });

    expect(rawResult).toEqual([100, 200, 300, 400]);
    expect(
      adapter.normalizeResultToPixelBbox(
        adapter.resolveLocateResult(rawResult),
        { width: 200, height: 100 },
      ),
    ).toEqual([20, 20, 60, 40]);
  });

  it('supports normalized point responses with the default point fallback', () => {
    const adapter = createLocateResultAdapter({
      format: 'point-normalized-0-1000-xy',
    });

    const rawResult = adapter.extractRawLocateResult({
      point: [500, 250],
    });

    expect(rawResult).toEqual([500, 250]);
    expect(
      adapter.normalizeResultToPixelBbox(
        adapter.resolveLocateResult(rawResult),
        { width: 200, height: 100 },
      ),
    ).toEqual([98, 24, 102, 26]);
  });

  it('supports actual pixel point responses with the default point fallback', () => {
    const adapter = createLocateResultAdapter({
      format: 'point-actual-pixel-xy',
    });

    expect(
      adapter.normalizeResultToPixelBbox(
        adapter.resolveLocateResult([20, 30]),
        { width: 100, height: 80 },
      ),
    ).toEqual([10, 20, 30, 40]);
  });

  it('allows fully custom extraction, resolution, and normalization', () => {
    const extract = vi.fn((input: unknown) => {
      return (input as { payload: { region: unknown } }).payload.region;
    });
    const resolve = vi.fn(() => ({
      type: 'point' as const,
      coordinates: [3, 4] as [number, number],
    }));
    const normalize = vi.fn(() => [1, 2, 3, 4] as const);
    const adapter = createLocateResultAdapter({
      format: 'bbox-actual-pixel-xyxy',
      extract,
      resolve,
      normalize,
    });

    const rawResult = adapter.extractRawLocateResult({
      payload: { region: { x: 3, y: 4 } },
    });
    const resolvedResult = adapter.resolveLocateResult(rawResult);

    expect(rawResult).toEqual({ x: 3, y: 4 });
    expect(resolvedResult).toEqual({
      type: 'point',
      coordinates: [3, 4],
    });
    expect(
      adapter.normalizeResultToPixelBbox(resolvedResult, {
        width: 100,
        height: 100,
      }),
    ).toEqual([1, 2, 3, 4]);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ x: 3, y: 4 });
    expect(normalize).toHaveBeenCalledWith(
      { type: 'point', coordinates: [3, 4] },
      { width: 100, height: 100 },
    );
  });
});
