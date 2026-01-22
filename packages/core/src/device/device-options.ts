import type { DeviceAction } from '../types';

/**
 * Android device input options
 */
export type AndroidDeviceInputOpt = {
  /** Automatically dismiss the keyboard after input is completed */
  autoDismissKeyboard?: boolean;
  /** Strategy for dismissing the keyboard: 'esc-first' tries ESC before BACK, 'back-first' tries BACK before ESC */
  keyboardDismissStrategy?: 'esc-first' | 'back-first';
};

/**
 * Android device options
 */
export type AndroidDeviceOpt = {
  /** Path to the ADB executable */
  androidAdbPath?: string;
  /** Remote ADB host address */
  remoteAdbHost?: string;
  /** Remote ADB port */
  remoteAdbPort?: number;
  /** Input method editor strategy: 'always-yadb' always uses yadb, 'yadb-for-non-ascii' uses yadb only for non-ASCII characters */
  imeStrategy?: 'always-yadb' | 'yadb-for-non-ascii';
  /** Display ID to use for this device */
  displayId?: number;
  /** Use physical display ID for screenshot operations */
  usePhysicalDisplayIdForScreenshot?: boolean;
  /** Use physical display ID when looking up display information */
  usePhysicalDisplayIdForDisplayLookup?: boolean;
  /** Custom device actions to register */
  customActions?: DeviceAction<any>[];
  /** Screenshot resize scale factor */
  screenshotResizeScale?: number;
  /** Always fetch screen info on each call; if false, cache the first result */
  alwaysRefreshScreenInfo?: boolean;
  /** Minimum screenshot buffer size in bytes (default: 10240 = 10KB). Set to 0 to disable validation. */
  minScreenshotBufferSize?: number;
} & AndroidDeviceInputOpt;

/**
 * iOS device input options
 */
export type IOSDeviceInputOpt = {
  /** Automatically dismiss the keyboard after input is completed */
  autoDismissKeyboard?: boolean;
};

/**
 * iOS device options
 */
export type IOSDeviceOpt = {
  /** Device ID (UDID) to connect to */
  deviceId?: string;
  /** Custom device actions to register */
  customActions?: DeviceAction<any>[];
  /** WebDriverAgent port (default: 8100) */
  wdaPort?: number;
  /** WebDriverAgent host (default: 'localhost') */
  wdaHost?: string;
  /** Whether to use WebDriverAgent */
  useWDA?: boolean;
} & IOSDeviceInputOpt;
