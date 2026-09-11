/**
 * Transport-agnostic Android device contract.
 *
 * Everything in `src/transport/**` may know about shell commands, Binder or
 * AIDL. Callers above it (device layer, agent, business code) must only use
 * these types, so the privilege backend can be swapped without touching them.
 */

/** Which privilege channel a transport uses. */
export type TransportBackend =
  /** POC: plain Node process spawns `rish` to reach the Shizuku shell. */
  | 'rish'
  /** Product: app → Binder/AIDL → Shizuku UserService (shell/root UID). */
  | 'shizuku-userservice'
  /** Car/head-unit: platform signature / priv-app / OEM system service. */
  | 'oem-privileged'
  /** Debug and regression baseline: external adb host → shell. */
  | 'adb-shell'
  /** Degraded: an unprivileged local shell (non ADB-equivalent capabilities). */
  | 'local-shell';

/** A point in device-pixel coordinates on the screen. */
export interface Point {
  x: number;
  y: number;
}

export type DisplayRotation = 0 | 90 | 180 | 270;

export interface DisplayInfo {
  /** Android display id; never assume `0` is the only display. */
  id: number;
  name: string;
  /** Width in device pixels for the current rotation. */
  width: number;
  /** Height in device pixels for the current rotation. */
  height: number;
  density: number;
  rotation: DisplayRotation;
  /** True for the display that hosts the default/primary UI. */
  isDefault: boolean;
  /** True for virtual displays (scrcpy, casting, automotive clusters, ...). */
  isVirtual: boolean;
}

export type TextInputSupport = 'full' | 'ascii-only' | 'none';

export interface AndroidCapabilities {
  backend: TransportBackend;
  /** `runShell` is usable. */
  shell: boolean;
  screenshot: boolean;
  input: boolean;
  appManagement: boolean;
  /** More than one display is currently reported by the device. */
  multiDisplay: boolean;
  /**
   * `input text` can only deliver printable ASCII. Non-ASCII input needs a
   * dedicated IME/input service (Phase 3); transports must fail loudly instead
   * of silently typing nothing.
   */
  textInput: TextInputSupport;
  /** The transport runs as shell (2000) or root (0), i.e. ADB-equivalent. */
  privileged: boolean;
  /** Effective uid of the command channel, when it could be probed. */
  uid: number | null;
}

export interface ScreenshotOptions {
  /** Target display; falls back to the transport default when omitted. */
  displayId?: number;
  timeoutMs?: number;
}

export interface DisplayQueryOptions {
  displayId?: number;
}

export interface InputOptions {
  displayId?: number;
  /** Gesture duration. `tap` uses it for a long press. */
  durationMs?: number;
}

export interface TextInputOptions {
  displayId?: number;
  timeoutMs?: number;
}

export interface ShellOptions {
  timeoutMs?: number;
  /** Collect stdout as bytes; callers that expect text can ignore this. */
  binary?: boolean;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ActivityTarget {
  /**
   * Package to target. Optional for a plain VIEW intent (`uri` only); required
   * for a component start or a launcher start.
   */
  packageName?: string;
  /** Activity class, e.g. `.MainActivity`. */
  activity?: string;
  /** Deep link / VIEW intent data. Takes precedence over `activity`. */
  uri?: string;
}

export interface TransportHealth {
  ok: boolean;
  backend: TransportBackend;
  uid: number | null;
  latencyMs: number;
  checkedAt: number;
  details?: string;
  error?: Error;
}

/**
 * The device capability contract. Implementations must be interchangeable:
 * a Shizuku UserService backend must satisfy the same tests as `rish`.
 */
export interface AndroidTransport {
  readonly backend: TransportBackend;

  getCapabilities(): Promise<AndroidCapabilities>;

  /** Screenshot bytes (PNG/JPEG). Never a temp file, never a base64 string. */
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;

  getDisplayInfo(options?: DisplayQueryOptions): Promise<DisplayInfo>;
  listDisplays(): Promise<DisplayInfo[]>;

  tap(x: number, y: number, options?: InputOptions): Promise<void>;
  swipe(from: Point, to: Point, options?: InputOptions): Promise<void>;
  /**
   * Send one or more keycodes in a single `input keyevent` call. Batching
   * matters: clearing a field sends ~200 keycodes and one process per keycode
   * would be unusable on a car head unit.
   */
  keyEvent(keyCode: number | number[], options?: InputOptions): Promise<void>;
  inputText(text: string, options?: TextInputOptions): Promise<void>;

  startActivity(target: ActivityTarget): Promise<void>;
  forceStop(packageName: string): Promise<void>;

  runShell?(command: string, options?: ShellOptions): Promise<ShellResult>;

  /** Never throws: reports reachability as data. */
  healthCheck(): Promise<TransportHealth>;

  close(): Promise<void>;
}
