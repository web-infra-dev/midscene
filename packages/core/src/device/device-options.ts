import type { DeviceAction } from '../types';

/**
 * Android device input options
 */
export type AndroidDeviceInputOpt = {
  /** Automatically dismiss the keyboard after input is completed */
  autoDismissKeyboard?: boolean;
  /** Strategy for dismissing the keyboard: 'esc-first' tries ESC before BACK, 'back-first' tries BACK before ESC */
  keyboardDismissStrategy?: 'esc-first' | 'back-first';
  /**
   * Delay in milliseconds between keystrokes when typing text.
   *
   * When set, text is typed one character at a time with this delay between
   * each character, instead of sending the whole string at once. This helps
   * on devices or input fields that drop characters when input arrives too
   * fast (e.g. WiFi password fields on automotive displays).
   *
   * Only applies to the `input text` path (non-yadb). When yadb is used, the
   * entire string is committed atomically and this option is ignored.
   */
  keyboardTypeDelay?: number;
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
  /**
   * Screenshot strategy: 'auto' uses the standard capture paths (scrcpy →
   * adb.takeScreenshot → screencap) and uses yadb only if the screencap command
   * itself fails. It does not detect black frames. 'always-yadb' skips the
   * earlier paths and captures directly via the yadb tool. Use 'always-yadb'
   * on devices where `screencap` produces black frames for secure
   * (FLAG_SECURE) content but yadb succeeds (e.g. with a rooted/Magisk-hooked
   * system, or on Android versions where yadb's secure virtual display works).
   * Yadb only supports the default display; combining 'always-yadb' with a
   * non-zero displayId throws an error.
   *
   * @default 'auto'
   */
  screenshotStrategy?: 'auto' | 'always-yadb';
  /** Display ID to use for this device */
  displayId?: number;
  /** Use physical display ID for screenshot operations */
  usePhysicalDisplayIdForScreenshot?: boolean;
  /** Use physical display ID when looking up display information */
  usePhysicalDisplayIdForDisplayLookup?: boolean;
  /**
   * Whether to expose the built-in `RunAdbShell` action in the Android action
   * space.
   *
   * @default true
   */
  exposeRunAdbShellAction?: boolean;
  /** Custom device actions to register */
  customActions?: DeviceAction<any>[];
  /**
   * @deprecated This option has been removed and no longer has any effect.
   * Use `screenshotShrinkFactor` in AgentOpt instead to control screenshot size sent to AI model.
   */
  screenshotResizeScale?: number;
  /** Always fetch screen info on each call; if false, cache the first result */
  alwaysRefreshScreenInfo?: boolean;
  /**
   * Screenshot buffer size validation threshold in bytes. Buffers below this
   * value are treated as failed or corrupted captures. Defaults to 1024 (1KB).
   * Set to 0 to skip only this size check; empty-buffer and image-format
   * validation still run.
   */
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
     * ADB/yadb fallback screenshots use the same limit so they do not return to
     * full device resolution while scrcpy is temporarily unavailable.
     * Lower values reduce bandwidth but may affect image quality.
     *
     * @default 0 (no scaling, use original resolution)
     * @example
     * { maxSize: 1024 } // Always scale to 1024
     * Values must be non-negative integers; invalid values throw when the
     * scrcpy configuration is used.
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
     * For bandwidth-constrained remote links, explicitly set a lower value
     * such as 4000000 (4 Mbps) and tune it for the actual transport.
     * @default 100000000 (100 Mbps)
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
  /**
   * Delay in milliseconds between keystrokes when typing text.
   *
   * When set, text is typed one character at a time with this delay between
   * each character, instead of sending the whole string at once. This helps
   * on devices or input fields that drop characters when input arrives too fast.
   */
  keyboardTypeDelay?: number;
};

/**
 * iOS device options
 */
export type IOSDeviceOpt = {
  /**
   * Optional npm module path used to override the default iOS device implementation.
   * The target module must export an `IOSDevice` class (or default export) compatible with Midscene's iOS device interface.
   */
  iOSDeviceClassOverride?: string;
  /** Custom device actions to register */
  customActions?: DeviceAction<any>[];
  /** WebDriverAgent port (default: 8100) */
  wdaPort?: number;
  /** WebDriverAgent host (default: 'localhost') */
  wdaHost?: string;
  /**
   * Existing WebDriverAgent session ID to reuse.
   * When provided, Midscene skips creating a new WDA session and does not delete
   * the external session during cleanup.
   */
  sessionId?: string;
  /** WDA MJPEG server port for real-time screen streaming (default: 9100) */
  wdaMjpegPort?: number;
  /**
   * Use WDA's MJPEG stream as a continuous frame source for UI observation
   * (`agent.startObserving()`). Disabled by default (opt-in), mirroring
   * Android scrcpy. When disabled, observers fall back to sequential
   * `screenshotBase64()` capture.
   *
   * For multi-device concurrency, set a distinct `wdaMjpegPort` per device
   * (just like `wdaPort`) so each device streams from its own port.
   */
  wdaMjpegFrameSource?: {
    enabled?: boolean;
  };
} & IOSDeviceInputOpt;

/**
 * HarmonyOS device input options
 */
export type HarmonyDeviceInputOpt = {
  /** Automatically dismiss the keyboard after input is completed */
  autoDismissKeyboard?: boolean;
  /** Strategy for dismissing the keyboard. Defaults to 'esc-first'. */
  keyboardDismissStrategy?: 'esc-first' | 'back-first';
  /**
   * Delay in milliseconds between keystrokes when typing text.
   *
   * When set, text is typed one character at a time with this delay between
   * each character, instead of sending the whole string at once. This helps
   * on devices or input fields that drop characters when input arrives too fast.
   */
  keyboardTypeDelay?: number;
};

/**
 * HarmonyOS device options
 */
export type HarmonyDeviceOpt = {
  /** Path to the HDC executable */
  hdcPath?: string;
  /** Custom device actions to register */
  customActions?: DeviceAction<any>[];
  /**
   * @deprecated This option has been removed and no longer has any effect.
   * Use `screenshotShrinkFactor` in AgentOpt instead to control screenshot size sent to AI model.
   */
  screenshotResizeScale?: number;
} & HarmonyDeviceInputOpt;
