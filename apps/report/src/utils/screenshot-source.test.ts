import type { ScreenshotRef } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { resolveScreenshotFallbackPath } from './screenshot-source';

describe('resolveScreenshotFallbackPath', () => {
  it('uses the MIME-specific extension for screenshot references', () => {
    expect(
      resolveScreenshotFallbackPath({
        type: 'midscene_screenshot_ref',
        id: 'webp-shot',
        capturedAt: 100,
        mimeType: 'image/webp',
        storage: 'inline',
      }),
    ).toBe('./screenshots/webp-shot.webp');
    expect(
      resolveScreenshotFallbackPath({
        type: 'midscene_screenshot_ref',
        id: 'jpeg-shot',
        capturedAt: 100,
        mimeType: 'image/jpeg',
        storage: 'inline',
      }),
    ).toBe('./screenshots/jpeg-shot.jpeg');
  });

  it('prefers an explicit file-backed path', () => {
    expect(
      resolveScreenshotFallbackPath({
        type: 'midscene_screenshot_ref',
        id: 'webp-shot',
        capturedAt: 100,
        mimeType: 'image/webp',
        storage: 'file',
        path: './assets/custom.webp',
      }),
    ).toBe('./assets/custom.webp');
  });

  it('throws instead of assuming PNG when MIME metadata is missing', () => {
    const invalidRef = {
      type: 'midscene_screenshot_ref',
      id: 'missing-mime',
      capturedAt: 100,
      storage: 'file',
      path: './screenshots/missing-mime.png',
    } as unknown as ScreenshotRef;

    expect(() => resolveScreenshotFallbackPath(invalidRef)).toThrow(
      'Unsupported screenshot mime type: undefined',
    );
  });

  it('throws on unsupported MIME metadata', () => {
    const invalidRef = {
      type: 'midscene_screenshot_ref',
      id: 'unsupported-mime',
      capturedAt: 100,
      mimeType: 'image/gif',
      storage: 'inline',
    } as unknown as ScreenshotRef;

    expect(() => resolveScreenshotFallbackPath(invalidRef)).toThrow(
      'Unsupported screenshot mime type: image/gif',
    );
  });
});
