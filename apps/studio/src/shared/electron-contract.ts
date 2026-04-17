/**
 * IPC channel names bridging the Midscene Studio main process and renderer.
 * Shared with {@link ElectronShellApi} so both sides agree on the wire
 * contract without importing renderer- or main-only code.
 */
export const IPC_CHANNELS = {
  closeWindow: 'shell:close-window',
  minimizeWindow: 'shell:minimize-window',
  openExternalUrl: 'shell:open-external-url',
  toggleMaximizeWindow: 'shell:toggle-maximize-window',
  // Multi-platform playground — replaces the Android-only channels below.
  getPlaygroundBootstrap: 'studio:get-playground-bootstrap',
  restartPlayground: 'studio:restart-playground',
  // Legacy aliases — kept so renderer code that hasn't migrated yet keeps
  // working. Both resolve to the same multi-platform runtime in main.
  getAndroidPlaygroundBootstrap: 'studio:get-playground-bootstrap',
  restartAndroidPlayground: 'studio:restart-playground',
  runConnectivityTest: 'studio:run-connectivity-test',
} as const;

export interface ConnectivityTestRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
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

/** @deprecated Use {@link PlaygroundBootstrap} instead. */
export type AndroidPlaygroundBootstrap = PlaygroundBootstrap;

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
  /**
   * Toggle maximize/unmaximize on the current shell window. No-op if the
   * window is not available (e.g. during teardown).
   */
  toggleMaximizeWindow: () => Promise<void>;
}

export interface StudioRuntimeApi {
  getPlaygroundBootstrap: () => Promise<PlaygroundBootstrap>;
  restartPlayground: () => Promise<PlaygroundBootstrap>;
  /** @deprecated Use {@link getPlaygroundBootstrap}. */
  getAndroidPlaygroundBootstrap: () => Promise<PlaygroundBootstrap>;
  /** @deprecated Use {@link restartPlayground}. */
  restartAndroidPlayground: () => Promise<PlaygroundBootstrap>;
  runConnectivityTest: (
    request: ConnectivityTestRequest,
  ) => Promise<ConnectivityTestResult>;
}
