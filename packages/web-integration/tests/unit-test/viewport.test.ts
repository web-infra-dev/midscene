import {
  defaultViewportSize,
  resolveViewportSize,
  resolveWebViewportSize,
} from '@/common/viewport';
import { describe, expect, it } from 'vitest';

describe('viewport helpers', () => {
  it('uses the shared default viewport size', () => {
    expect(defaultViewportSize).toEqual({
      width: 1440,
      height: 768,
    });
  });

  it('falls back to default or provided fallback for missing dimensions', () => {
    expect(resolveViewportSize()).toEqual(defaultViewportSize);
    expect(
      resolveViewportSize(
        {
          width: null,
          height: '720',
        },
        { width: 1280, height: 800 },
      ),
    ).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('resolves viewport and web viewport values from numbers or strings', () => {
    expect(resolveViewportSize({ width: '1536', height: 864 })).toEqual({
      width: 1536,
      height: 864,
    });
    expect(
      resolveWebViewportSize({
        viewportWidth: 1600,
        viewportHeight: '900',
      }),
    ).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it('rejects non-positive, fractional, or malformed dimensions', () => {
    expect(() => resolveViewportSize({ width: 0 })).toThrow(
      'viewportWidth must be greater than 0, but got 0',
    );
    expect(() => resolveViewportSize({ height: -1 })).toThrow(
      'viewportHeight must be greater than 0, but got -1',
    );
    expect(() => resolveViewportSize({ width: 1280.5 })).toThrow(
      'viewportWidth must be a positive integer, but got 1280.5',
    );
    expect(() => resolveViewportSize({ height: '720px' })).toThrow(
      'viewportHeight must be a positive integer, but got 720px',
    );
  });
});
