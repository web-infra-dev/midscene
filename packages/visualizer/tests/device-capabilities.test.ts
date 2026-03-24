import { describe, expect, test } from 'vitest';
import {
  getDeviceCapabilities,
  hasDeviceSpecificConfig,
} from '../src/utils/device-capabilities';

describe('device capabilities', () => {
  test('marks android-only capabilities correctly', () => {
    expect(getDeviceCapabilities('android')).toMatchObject({
      supportsImeStrategy: true,
      supportsKeyboardDismissStrategy: true,
      supportsAutoDismissKeyboard: true,
      supportsAlwaysRefreshScreenInfo: true,
    });
  });

  test('treats harmony like ios for shared keyboard dismissal behavior', () => {
    expect(getDeviceCapabilities('harmony')).toMatchObject({
      supportsImeStrategy: false,
      supportsKeyboardDismissStrategy: false,
      supportsAutoDismissKeyboard: true,
      supportsAlwaysRefreshScreenInfo: false,
    });
  });

  test('detects when a device has no specific config', () => {
    expect(hasDeviceSpecificConfig('web')).toBe(false);
    expect(hasDeviceSpecificConfig('computer')).toBe(false);
    expect(hasDeviceSpecificConfig('ios')).toBe(true);
  });
});
