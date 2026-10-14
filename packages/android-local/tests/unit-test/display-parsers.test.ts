import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

import {
  findDisplay,
  parseDisplayDeviceInfos,
  parseDisplayInfos,
  parseDisplays,
  parseViewports,
  parseWmDensity,
  parseWmSize,
} from '../../src/transport/parsers/display';

const fixtureDir = path.join(__dirname, 'fixtures');
const readFixture = (name: string) =>
  fs.readFileSync(path.join(fixtureDir, name), 'utf8');

// Captured from a 2560x1600 / density 320 / rotation 0 Android 12 emulator that
// also hosts a scrcpy virtual display (displayId 10, 4032x284).
const dumpsysDisplay = readFixture('dumpsys-display.txt');
const wmSize = readFixture('wm-size.txt');
const wmDensity = readFixture('wm-density.txt');

describe('dumpsys display parsing', () => {
  test('reads every DisplayDeviceInfo block', () => {
    const devices = parseDisplayDeviceInfos(dumpsysDisplay);

    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      name: 'Built-in Screen',
      width: 2560,
      height: 1600,
      density: 320,
      rotation: 0,
      type: 'INTERNAL',
      state: 'ON',
      hasDefaultFlag: true,
    });
    expect(devices[1]).toMatchObject({
      name: 'scrcpy',
      width: 4032,
      height: 284,
      density: 120,
      type: 'VIRTUAL',
      hasDefaultFlag: false,
    });
  });

  test('reads the numeric display id from mBaseDisplayInfo, including the stray quote', () => {
    const infos = parseDisplayInfos(dumpsysDisplay);

    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({
      name: 'Built-in Screen',
      id: 0,
      width: 2560,
      height: 1600,
      density: 320,
    });
    expect(infos[1]).toMatchObject({ name: 'scrcpy', id: 10 });
  });

  test('reads the active viewports', () => {
    const viewports = parseViewports(dumpsysDisplay);

    expect(viewports).toHaveLength(2);
    expect(viewports[0]).toMatchObject({
      displayId: 0,
      type: 'INTERNAL',
      isActive: true,
    });
    expect(viewports[1]).toMatchObject({
      displayId: 10,
      type: 'VIRTUAL',
      isActive: true,
    });
  });

  test('returns nothing for output without display blocks', () => {
    expect(parseDisplayDeviceInfos('no displays here')).toEqual([]);
    expect(parseDisplayInfos('no displays here')).toEqual([]);
  });
});

describe('wm size / density parsing', () => {
  test('reads the physical size', () => {
    expect(parseWmSize(wmSize)).toEqual({
      physical: { width: 2560, height: 1600 },
      override: undefined,
    });
  });

  test('reads override size and density when the device reports them', () => {
    expect(
      parseWmSize('Physical size: 2560x1600\nOverride size: 1280x800\n'),
    ).toEqual({
      physical: { width: 2560, height: 1600 },
      override: { width: 1280, height: 800 },
    });
    expect(
      parseWmDensity('Physical density: 320\nOverride density: 440\n'),
    ).toEqual({ physical: 320, override: 440 });
  });

  test('returns an empty object for unrelated output', () => {
    expect(parseWmSize('')).toEqual({
      physical: undefined,
      override: undefined,
    });
    expect(parseWmDensity('')).toEqual({
      physical: undefined,
      override: undefined,
    });
  });
});

describe('parseDisplays', () => {
  test('merges display ids, default flags and virtual displays', () => {
    const displays = parseDisplays({ dumpsysDisplay, wmSize, wmDensity });

    expect(displays.map((display) => display.id)).toEqual([0, 10]);
    expect(displays[0]).toMatchObject({
      id: 0,
      name: 'Built-in Screen',
      width: 2560,
      height: 1600,
      density: 320,
      rotation: 0,
      isDefault: true,
      isVirtual: false,
    });
    expect(displays[1]).toMatchObject({
      id: 10,
      name: 'scrcpy',
      width: 4032,
      height: 284,
      isDefault: false,
      isVirtual: true,
    });
  });

  test('falls back to `wm size` when no DisplayDeviceInfo is printed', () => {
    const displays = parseDisplays({
      dumpsysDisplay: 'DisplayManagerService: no device info',
      wmSize: 'Physical size: 1080x1920\n',
      wmDensity: 'Physical density: 440\n',
    });

    expect(displays).toEqual([
      {
        id: 0,
        name: 'default',
        width: 1080,
        height: 1920,
        density: 440,
        rotation: 0,
        isDefault: true,
        isVirtual: false,
      },
    ]);
  });

  test('marks an internal display as default when no flag is present', () => {
    const displays = parseDisplays({
      dumpsysDisplay: [
        'DisplayDeviceInfo{"Secondary": uniqueId="local:2", 1280 x 720, density 160, rotation 90, type INTERNAL, state ON}',
      ].join('\n'),
    });

    expect(displays).toHaveLength(1);
    expect(displays[0]).toMatchObject({
      id: 0,
      rotation: 90,
      isDefault: true,
      isVirtual: false,
    });
  });

  test('returns an empty list when nothing can be parsed', () => {
    expect(parseDisplays({ dumpsysDisplay: '' })).toEqual([]);
  });

  test('findDisplay looks up by id', () => {
    const displays = parseDisplays({ dumpsysDisplay, wmSize, wmDensity });

    expect(findDisplay(displays, 10)?.name).toBe('scrcpy');
    expect(findDisplay(displays, 99)).toBeUndefined();
  });
});
