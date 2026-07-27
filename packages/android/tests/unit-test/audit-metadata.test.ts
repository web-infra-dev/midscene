import type { ADB } from 'appium-adb';
import { describe, expect, it, vi } from 'vitest';
import { collectAndroidAuditEnvironment } from '../../src/audit-metadata';

function adbFixture(packageName = 'com.example.app'): ADB {
  const outputByCommand: Record<string, string> = {
    'getprop ro.product.manufacturer': 'Example',
    'getprop ro.product.model': 'Phone X',
    'getprop ro.build.version.release': '15',
    'getprop ro.build.version.sdk': '35',
    'wm size': 'Physical size: 1080x2400\nOverride size: 900x2000',
    'dumpsys activity activities': `mResumedActivity: ActivityRecord{0 u0 ${packageName}/.MainActivity t1}`,
    'dumpsys window windows': '',
    'dumpsys input': 'SurfaceOrientation: 0',
    [`dumpsys package ${packageName}`]: 'versionCode=398000 versionName=39.8.0',
  };
  return {
    getScreenDensity: vi.fn(async () => 480),
    shell: vi.fn(async (command: string) => outputByCommand[command] ?? ''),
  } as unknown as ADB;
}

describe('Android audit metadata', () => {
  it('collects the canonical device and foreground-app environment', async () => {
    await expect(
      collectAndroidAuditEnvironment(adbFixture(), {
        deviceId: 'serial-1',
        expectedPackage: 'com.example.app',
        screenshotSize: { width: 900, height: 2000 },
      }),
    ).resolves.toEqual({
      device: {
        serial: 'serial-1',
        manufacturer: 'Example',
        model: 'Phone X',
        androidVersion: '15',
        apiLevel: '35',
        resolution: {
          physical: { width: 1080, height: 2400 },
          override: { width: 900, height: 2000 },
          logical: { width: 300, height: 2000 / 3 },
          screenshot: { width: 900, height: 2000 },
        },
        density: 480,
        dpr: 3,
        rotation: 0,
      },
      app: {
        expectedPackage: 'com.example.app',
        package: 'com.example.app',
        activity: '.MainActivity',
        versionName: '39.8.0',
        versionCode: '398000',
      },
    });
  });

  it('rejects metadata captured from the wrong foreground package', async () => {
    await expect(
      collectAndroidAuditEnvironment(adbFixture('com.example.other'), {
        deviceId: 'serial-1',
        expectedPackage: 'com.example.app',
        screenshotSize: { width: 900, height: 2000 },
      }),
    ).rejects.toThrow(
      'Focused package com.example.other does not match requested app com.example.app',
    );
  });
});
