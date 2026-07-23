import { describe, expect, it } from 'vitest';
import { resolveScreenshotFallbackPath } from './screenshot-source';

describe('resolveScreenshotFallbackPath', () => {
  it('keeps the legacy PNG fallback when only an id is available', () => {
    expect(resolveScreenshotFallbackPath('legacy-shot')).toBe(
      './screenshots/legacy-shot.png',
    );
  });

  it('uses the MIME-specific extension for screenshot references', () => {
    expect(
      resolveScreenshotFallbackPath({
        id: 'webp-shot',
        mimeType: 'image/webp',
        storage: 'inline',
      }),
    ).toBe('./screenshots/webp-shot.webp');
    expect(
      resolveScreenshotFallbackPath({
        id: 'jpeg-shot',
        mimeType: 'image/jpeg',
        storage: 'inline',
      }),
    ).toBe('./screenshots/jpeg-shot.jpeg');
  });

  it('prefers an explicit file-backed path', () => {
    expect(
      resolveScreenshotFallbackPath({
        id: 'webp-shot',
        mimeType: 'image/webp',
        storage: 'file',
        path: './assets/custom.webp',
      }),
    ).toBe('./assets/custom.webp');
  });
});
