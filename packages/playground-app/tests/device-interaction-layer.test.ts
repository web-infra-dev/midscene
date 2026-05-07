import { describe, expect, it } from 'vitest';
import { inscribedContentRect } from '../src/DeviceInteractionLayer';

describe('inscribedContentRect', () => {
  it('letter-boxes horizontally when the panel is wider than device aspect', () => {
    // Panel: 1000x500 (2:1) – Device: 100x200 (portrait, 1:2)
    // Content should be a 250x500 rect centered horizontally.
    const rect = inscribedContentRect(
      { left: 0, top: 0, width: 1000, height: 500 },
      { width: 100, height: 200 },
    );
    expect(rect.height).toBe(500);
    expect(rect.width).toBe(250);
    expect(rect.left).toBe(375);
    expect(rect.top).toBe(0);
  });

  it('letter-boxes vertically when the panel is taller than device aspect', () => {
    // Panel: 500x1000 (1:2) – Device: 200x100 (landscape, 2:1)
    // Content should be a 500x250 rect centered vertically.
    const rect = inscribedContentRect(
      { left: 0, top: 0, width: 500, height: 1000 },
      { width: 200, height: 100 },
    );
    expect(rect.width).toBe(500);
    expect(rect.height).toBe(250);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(375);
  });

  it('preserves panel rect when aspect ratios match exactly', () => {
    const panel = { left: 10, top: 20, width: 300, height: 600 };
    const rect = inscribedContentRect(panel, { width: 100, height: 200 });
    expect(rect).toEqual(panel);
  });

  it('returns the panel unchanged when dimensions are zero or negative', () => {
    const panel = { left: 5, top: 5, width: 0, height: 100 };
    expect(inscribedContentRect(panel, { width: 9, height: 19 })).toEqual(
      panel,
    );
  });
});
