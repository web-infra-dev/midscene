/**
 * Transport-agnostic Android device contract.
 *
 * Everything in `src/transport/**` may know about shell commands, Binder or
 * AIDL. Callers above it (device layer, agent, business code) must only use
 * these types, so the privilege backend can be swapped without touching them.
 */

/**
 * How commands travel from the agent to a shell.
 *
 * This names the *route*, not the privilege source, because the on-device route
 * now carries two of them: the app's loopback bridge can be served either by a
 * Shizuku user service or by the app's own adb client talking to the device's
 * adbd. Reporting the route as "shizuku-userservice" made every log line from the
 * adb channel state something untrue; the source is {@link ExecChannel}.
 */
export type TransportBackend =
  /** Product: agent → app loopback bridge → a shell the app arranged. */
  | 'device-bridge'
  /**
   * @deprecated The old name for `device-bridge`, back when Shizuku was the only
   * thing behind it. Still accepted in config so existing files keep working.
   */
  | 'shizuku-userservice'
  /** Debug and regression baseline: an adb host (PC) drives the device. */
  | 'adb-shell'
  /** Car/head-unit (not implemented): platform signature / priv-app / OEM service. */
  | 'oem-privileged'
  /** Degraded (not implemented): an unprivileged local shell. */
  | 'local-shell';

/**
 * What actually provides the shell, independent of the route.
 *
 * `shizuku` and `adb` both end at uid 2000; they differ in what has to be true on
 * the phone for that to happen, which is the thing worth printing when a run fails.
 */
export type ExecChannel = 'shizuku' | 'adb';

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
  /** Who provides the shell behind that route. */
  channel: ExecChannel;
  /** `runShell` is usable. */
  shell: boolean;
  screenshot: boolean;
  input: boolean;
  appManagement: boolean;
  /** More than one display is currently reported by the device. */
  multiDisplay: boolean;
  /**
   * Two-finger gestures (pinch) are available. `input swipe` cannot express
   * multi-touch, so this is only true when a gesture injector (yadb) is present.
   */
  gestures: boolean;
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
  channel: ExecChannel;
  uid: number | null;
  latencyMs: number;
  checkedAt: number;
  details?: string;
  error?: Error;
}

/**
 * The device capability contract. Implementations must be interchangeable:
 * every backend must satisfy the same contract test.
 */
export interface AndroidTransport {
  readonly backend: TransportBackend;

  /** What provides the shell: a Shizuku user service, or the device's own adbd. */
  readonly channel: ExecChannel;

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

  /**
   * Two-finger pinch around `center`. Optional: backends without a gesture
   * injector omit it, and the device layer then omits the Pinch action instead
   * of degrading it into two separate swipes.
   */
  pinch?(
    center: Point,
    options: {
      startDistance: number;
      endDistance: number;
      duration: number;
      displayId?: number;
    },
  ): Promise<void>;

  startActivity(target: ActivityTarget): Promise<void>;
  forceStop(packageName: string): Promise<void>;

  runShell?(command: string, options?: ShellOptions): Promise<ShellResult>;

  /** Never throws: reports reachability as data. */
  healthCheck(): Promise<TransportHealth>;

  close(): Promise<void>;
}
