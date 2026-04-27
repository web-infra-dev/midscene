/**
 * IPC channel names bridging the Midscene Studio main process and renderer.
 * Shared with {@link ElectronShellApi} so both sides agree on the wire
 * contract without importing renderer- or main-only code.
 */
export const IPC_CHANNELS = {
  closeWindow: 'shell:close-window',
  minimizeWindow: 'shell:minimize-window',
  openExternalUrl: 'shell:open-external-url',
  chooseReportSavePath: 'shell:choose-report-save-path',
  toggleMaximizeWindow: 'shell:toggle-maximize-window',
  writeReportFile: 'shell:write-report-file',
  // Multi-platform playground runtime (Android, iOS, HarmonyOS, Computer).
  getPlaygroundBootstrap: 'studio:get-playground-bootstrap',
  restartPlayground: 'studio:restart-playground',
  // Cross-platform device discovery — returns devices from ALL platforms
  // at once (Android via ADB, Harmony via HDC, Computer via display
  // enumeration). Independent of session manager.
  discoverDevices: 'studio:discover-devices',
  discoveredDevicesUpdated: 'studio:discovered-devices-updated',
  setDiscoveryPollingPaused: 'studio:set-discovery-polling-paused',
  runConnectivityTest: 'studio:run-connectivity-test',
} as const;

export interface ConnectivityTestRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface WriteReportFileRequest {
  path: string;
  content: string;
}

export type ConnectivityTestResult =
  | { ok: true; sample: string }
  | { ok: false; error: string };

/** Generic bootstrap status for the multi-platform playground server. */
export interface PlaygroundBootstrap {
  status: 'starting' | 'ready' | 'error';
  serverUrl: string | null;
  port: number | null;
  error: string | null;
}

/**
 * Canonical set of platform identifiers the Studio shell understands.
 * Shared between main process discovery and renderer sidebar/buckets so
 * neither side can drift into using a stringly-typed platform id.
 */
export const STUDIO_PLATFORM_IDS = [
  'android',
  'ios',
  'computer',
  'harmony',
  'web',
] as const;

export type StudioPlatformId = (typeof STUDIO_PLATFORM_IDS)[number];

export type StudioSessionValue = string | number | boolean;

/** A device discovered across any platform, tagged with its platform. */
export interface DiscoveredDevice {
  platformId: StudioPlatformId;
  id: string;
  label: string;
  description?: string;
  /** Optional platform-native availability state, e.g. `device` or `offline`. */
  status?: string;
  /**
   * Session-setup field values for this discovered target, before Studio
   * prefixes them with `{platformId}.`.
   */
  sessionValues?: Record<string, StudioSessionValue>;
}

/** Result of the cross-platform device discovery scan. */
export type DiscoverDevicesResult = DiscoveredDevice[];

export interface DiscoverDevicesRequest {
  forceRefresh?: boolean;
}

/**
 * Public API exposed on `window.electronShell` by the preload bridge.
 *
 * Every method is a one-way command sent over IPC to the main process. The
 * renderer never talks to Electron directly — all native interactions must
 * pass through this interface so the renderer stays trivially sandboxable.
 */
export interface ElectronShellApi {
  /** Request the main process to close the current shell window. */
  closeWindow: () => Promise<void>;
  /** Request the main process to minimize the current shell window. */
  minimizeWindow: () => Promise<void>;
  /** Open an external HTTP(S) link in the system browser. */
  openExternalUrl: (url: string) => Promise<void>;
  /** Ask the main process for a target path for a report HTML export. */
  chooseReportSavePath: (defaultFileName?: string) => Promise<string | null>;
  /**
   * Toggle maximize/unmaximize on the current shell window. No-op if the
   * window is not available (e.g. during teardown).
   */
  toggleMaximizeWindow: () => Promise<void>;
  /** Persist a report HTML file using the native shell process. */
  writeReportFile: (request: WriteReportFileRequest) => Promise<void>;
}

export interface StudioRuntimeApi {
  getPlaygroundBootstrap: () => Promise<PlaygroundBootstrap>;
  restartPlayground: () => Promise<PlaygroundBootstrap>;
  /** Scan ALL platforms for connected devices (ADB, HDC, displays). */
  discoverDevices: (
    request?: DiscoverDevicesRequest,
  ) => Promise<DiscoverDevicesResult>;
  onDiscoveredDevicesChanged: (
    listener: (devices: DiscoverDevicesResult) => void,
  ) => () => void;
  setDiscoveryPollingPaused: (paused: boolean) => Promise<void>;
  runConnectivityTest: (
    request: ConnectivityTestRequest,
  ) => Promise<ConnectivityTestResult>;
}
