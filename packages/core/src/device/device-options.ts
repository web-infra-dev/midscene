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
  /**
   * Scrcpy screenshot configuration for high-performance screen capture.
   *
   * Scrcpy provides 6-8x faster screenshots by streaming H.264 video from the device.
   * When enabled, scrcpy will:
   * 1. Start a video stream from the device on first screenshot request
   * 2. Keep the connection alive for subsequent screenshots (16-50ms each)
   * 3. Automatically disconnect after idle timeout to save resources
   * 4. Fallback to standard ADB mode if unavailable
   *
   * @example
   * ```typescript
   * // Enable scrcpy for high-performance screenshots
   * const device = new AndroidDevice(deviceId, {
   *   scrcpyConfig: {
   *     enabled: true,
   *   },
   * });
   *
   * // Custom configuration
   * const device = new AndroidDevice(deviceId, {
   *   scrcpyConfig: {
   *     enabled: true,
   *     maxSize: 0,        // 0 = no scaling
   *     idleTimeoutMs: 30000,
   *     videoBitRate: 8_000_000,
   *   },
   * });
   * ```
   */
  scrcpyConfig?: {
    /**
     * Enable scrcpy for high-performance screenshots.
     * @default false
     */
    enabled?: boolean;
    /**
     * Maximum video dimension (width or height).
     * Video stream will be scaled down if device resolution exceeds this value.
     * Lower values reduce bandwidth but may affect image quality.
     *
     * If not specified and `screenshotResizeScale` is set, maxSize will be
     * automatically calculated to match the target resolution.
     *
     * @default 0 (no scaling, use original resolution)
     * @example
     * // Manual control
     * { maxSize: 1024 } // Always scale to 1024
     *
     * // Auto-calculated from screenshotResizeScale
     * { screenshotResizeScale: 0.5 } // Device 1080p → scrcpy maxSize will be 1200
     */
    maxSize?: number;
    /**
     * Idle timeout in milliseconds before disconnecting scrcpy.
     * Connection auto-closes after this period of inactivity to save resources.
     * Set to 0 to disable auto-disconnect.
     * @default 30000 (30 seconds)
     */
    idleTimeoutMs?: number;
    /**
     * Video bit rate for H.264 encoding in bits per second.
     * Higher values improve quality but increase bandwidth usage.
     * @default 2000000 (2 Mbps)
     */
    videoBitRate?: number;
  };
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
