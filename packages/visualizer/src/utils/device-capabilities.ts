import type { DeviceType } from '../types';

export interface DeviceCapabilities {
  supportsImeStrategy: boolean;
  supportsKeyboardDismissStrategy: boolean;
  supportsAutoDismissKeyboard: boolean;
  supportsAlwaysRefreshScreenInfo: boolean;
}

export function getDeviceCapabilities(
  deviceType?: DeviceType,
): DeviceCapabilities {
  return {
    supportsImeStrategy: deviceType === 'android',
    supportsKeyboardDismissStrategy: deviceType === 'android',
    supportsAutoDismissKeyboard:
      deviceType === 'android' ||
      deviceType === 'ios' ||
      deviceType === 'harmony',
    supportsAlwaysRefreshScreenInfo: deviceType === 'android',
  };
}

export function hasDeviceSpecificConfig(deviceType?: DeviceType): boolean {
  const capabilities = getDeviceCapabilities(deviceType);
  return Object.values(capabilities).some(Boolean);
}
