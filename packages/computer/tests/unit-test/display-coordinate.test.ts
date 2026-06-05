import { describe, expect, it } from 'vitest';
import {
  type DarwinDisplayGeometry,
  mapDisplayLocalPointToGlobal,
} from '../../src/device';

describe('display coordinate mapping', () => {
  it('keeps points unchanged when no display geometry is available', () => {
    expect(mapDisplayLocalPointToGlobal({ x: 12, y: 34 })).toEqual({
      x: 12,
      y: 34,
    });
  });

  it('maps display-local coordinates to global desktop coordinates', () => {
    const geometry: DarwinDisplayGeometry = {
      screenIndex: 2,
      cgDisplayId: 3,
      primary: false,
      bounds: {
        x: 1769,
        y: -1080,
        width: 1080,
        height: 1920,
      },
    };

    expect(mapDisplayLocalPointToGlobal({ x: 120, y: 240 }, geometry)).toEqual({
      x: 1889,
      y: -840,
    });
  });
});
