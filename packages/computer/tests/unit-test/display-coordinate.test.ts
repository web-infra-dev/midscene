import { describe, expect, it } from 'vitest';
import {
  type DarwinDisplayGeometry,
  mapDisplayLocalPointToGlobal,
  resolveDarwinDisplayGeometryFromList,
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

describe('macOS display geometry resolution', () => {
  const displays: DarwinDisplayGeometry[] = [
    {
      screenIndex: 0,
      cgDisplayId: 111,
      primary: true,
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
    },
    {
      screenIndex: 1,
      cgDisplayId: 222,
      primary: false,
      bounds: { x: -151, y: -1080, width: 1920, height: 1080 },
    },
    {
      screenIndex: 2,
      cgDisplayId: 333,
      primary: false,
      bounds: { x: 1769, y: -1080, width: 1080, height: 1920 },
    },
  ];

  it('prefers screen index ids from screenshot-desktop display metadata', () => {
    expect(resolveDarwinDisplayGeometryFromList('2', displays)).toBe(
      displays[2],
    );
  });

  it('falls back to CG display ids for legacy display ids', () => {
    expect(resolveDarwinDisplayGeometryFromList('333', displays)).toBe(
      displays[2],
    );
  });

  it('does not confuse a screenshot screen index with a CG display id', () => {
    const mixedDisplays: DarwinDisplayGeometry[] = [
      {
        screenIndex: 0,
        cgDisplayId: 1,
        primary: true,
        bounds: { x: 0, y: 0, width: 1512, height: 982 },
      },
      {
        screenIndex: 1,
        cgDisplayId: 222,
        primary: false,
        bounds: { x: 1512, y: 0, width: 1728, height: 1117 },
      },
    ];

    expect(resolveDarwinDisplayGeometryFromList('1', mixedDisplays)).toBe(
      mixedDisplays[1],
    );
  });

  it('uses the primary display when no display id is configured', () => {
    expect(resolveDarwinDisplayGeometryFromList(undefined, displays)).toBe(
      displays[0],
    );
  });
});
