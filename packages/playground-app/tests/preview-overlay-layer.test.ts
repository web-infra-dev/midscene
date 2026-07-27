import { describe, expect, it } from 'vitest';
import { relativePreviewRect } from '../src/PreviewOverlayLayer';

describe('relativePreviewRect', () => {
  it('projects the device screen into the preview root after letterboxing', () => {
    expect(
      relativePreviewRect(
        { left: 100, top: 50, width: 1000, height: 700 },
        { left: 200, top: 100, width: 800, height: 600 },
        { width: 100, height: 200 },
      ),
    ).toEqual({
      left: 350,
      top: 50,
      width: 300,
      height: 600,
    });
  });
});
