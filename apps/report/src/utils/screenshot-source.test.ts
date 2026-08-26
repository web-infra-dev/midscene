import { describe, expect, it } from '@rstest/core';
import { resolveScreenshotFallbackPath } from './screenshot-source';

describe('resolveScreenshotFallbackPath', () => {
  it('uses MIME-specific extensions for screenshot references', () => {
    expect(
      resolveScreenshotFallbackPath({
        type: 'midscene_screenshot_ref',
        id: 'webp-shot',
        capturedAt: 1,
        mimeType: 'image/webp',
        storage: 'inline',
      }),
    ).toBe('./screenshots/webp-shot.webp');
    expect(
      resolveScreenshotFallbackPath({
        type: 'midscene_screenshot_ref',
        id: 'jpeg-shot',
        capturedAt: 1,
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
        capturedAt: 1,
        mimeType: 'image/webp',
        storage: 'file',
        path: './assets/custom.webp',
      }),
    ).toBe('./assets/custom.webp');
  });
});
