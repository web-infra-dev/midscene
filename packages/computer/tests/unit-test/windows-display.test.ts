import { Buffer } from 'node:buffer';
import { describe, expect, it } from '@rstest/core';
import {
  assertLegacyWindowsCoordinateCompatibility,
  discoverWindowsDisplays,
} from '../../src/windows-display';

function pngDataUri(width: number, height: number): string {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

const primaryGeometry = {
  id: '\\\\.\\DISPLAY6',
  name: '\\\\.\\DISPLAY6',
  primary: true,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
};

const primaryGeometryJson = JSON.stringify([primaryGeometry]);

describe('Windows display discovery', () => {
  it('keeps the physical path when physical enumeration succeeds', () => {
    let legacyCalls = 0;
    const discovery = discoverWindowsDisplays({
      physical: () => primaryGeometryJson,
      legacy: () => {
        legacyCalls += 1;
        return primaryGeometryJson;
      },
    });

    expect(discovery).toEqual({
      coordinateMode: 'physical',
      geometries: [primaryGeometry],
    });
    expect(legacyCalls).toBe(0);
  });

  it('uses the legacy path only when physical enumeration is empty', () => {
    const discovery = discoverWindowsDisplays({
      physical: () => '',
      legacy: () => primaryGeometryJson,
    });

    expect(discovery).toEqual({
      coordinateMode: 'legacy',
      geometries: [primaryGeometry],
    });
  });

  it('does not downgrade when the physical runner fails', () => {
    let legacyCalls = 0;

    expect(() =>
      discoverWindowsDisplays({
        physical: () => {
          throw new Error('PowerShell failed');
        },
        legacy: () => {
          legacyCalls += 1;
          return primaryGeometryJson;
        },
      }),
    ).toThrow(/PowerShell failed/);
    expect(legacyCalls).toBe(0);
  });

  it('does not downgrade malformed physical output', () => {
    let legacyCalls = 0;
    const legacy = () => {
      legacyCalls += 1;
      return primaryGeometryJson;
    };

    expect(() =>
      discoverWindowsDisplays({ physical: () => '{', legacy }),
    ).toThrow();
    expect(() =>
      discoverWindowsDisplays({
        physical: () => JSON.stringify([{ id: '\\\\.\\DISPLAY6' }]),
        legacy,
      }),
    ).toThrow(/invalid geometry/);
    expect(legacyCalls).toBe(0);
  });

  it('reports an empty legacy enumeration after fallback', () => {
    expect(() =>
      discoverWindowsDisplays({
        physical: () => '[]',
        legacy: () => '[]',
      }),
    ).toThrow(/Windows legacy display enumeration returned no displays/);
  });
});

describe('Windows legacy coordinate compatibility', () => {
  it('accepts an unscaled primary display with one consistent coordinate size', () => {
    expect(() =>
      assertLegacyWindowsCoordinateCompatibility({
        geometry: primaryGeometry,
        screenshotBase64: pngDataUri(1920, 1080),
        inputSize: { width: 1920, height: 1080 },
      }),
    ).not.toThrow();
  });

  it('rejects inconsistent screenshot and input coordinates', () => {
    expect(() =>
      assertLegacyWindowsCoordinateCompatibility({
        geometry: primaryGeometry,
        screenshotBase64: pngDataUri(1600, 900),
        inputSize: { width: 1920, height: 1080 },
      }),
    ).toThrow(
      /coordinate compatibility check failed: display=1920x1080, screenshot=1600x900, input=1920x1080/,
    );
  });

  it('rejects secondary displays', () => {
    expect(() =>
      assertLegacyWindowsCoordinateCompatibility({
        geometry: {
          primary: false,
          bounds: primaryGeometry.bounds,
        },
        screenshotBase64: pngDataUri(1920, 1080),
        inputSize: { width: 1920, height: 1080 },
      }),
    ).toThrow(/only supports the primary display/);
  });
});
