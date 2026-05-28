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

  test('marks harmony keyboard dismissal capabilities correctly', () => {
    expect(getDeviceCapabilities('harmony')).toMatchObject({
      supportsImeStrategy: false,
      supportsKeyboardDismissStrategy: true,
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
