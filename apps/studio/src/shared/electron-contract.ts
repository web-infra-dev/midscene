/**
 * IPC channel names bridging the Midscene Studio main process and renderer.
 * Shared with {@link ElectronShellApi} so both sides agree on the wire
 * contract without importing renderer- or main-only code.
 */
export const IPC_CHANNELS = {
  closeWindow: 'shell:close-window',
  minimizeWindow: 'shell:minimize-window',
  toggleMaximizeWindow: 'shell:toggle-maximize-window',
} as const;

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
  /**
   * Toggle maximize/unmaximize on the current shell window. No-op if the
   * window is not available (e.g. during teardown).
   */
  toggleMaximizeWindow: () => Promise<void>;
}
