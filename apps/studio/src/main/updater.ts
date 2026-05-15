import { getDebug } from '@midscene/shared/logger';
import { IPC_CHANNELS } from '@shared/electron-contract';
import type { UpdateStatus } from '@shared/updater-contract';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

const debugUpdater = getDebug('studio:updater', { console: true });

// Studio ships on Windows/Linux as a zip from @electron/packager (no NSIS
// installer, no AppImage). electron-updater can't replace a running binary
// in either case — NsisUpdater needs an installer it doesn't have, and the
// Linux flow only knows how to relaunch an AppImage. We keep
// checkForUpdates working so the user sees that a new version exists, but
// route them to the GitHub Releases page to grab the next zip manually.
const EXTERNAL_DOWNLOAD_ONLY =
  process.platform === 'win32' || process.platform === 'linux';

const BACKGROUND_POLL_FIRST_DELAY_MS = 10_000;
const BACKGROUND_POLL_INTERVAL_MS = 30 * 60 * 1000;

export class StudioUpdater {
  private getMainWindow: (() => BrowserWindow | null) | null = null;
  private currentStatus: UpdateStatus = { state: 'idle' };
  private pendingVersion: string | null = null;
  private downloadedFilePath: string | null = null;
  // Only true for the lifetime of a single `checkUserInitiated()` call. Set
  // in try/finally around the autoUpdater promise — electron-updater fires
  // `update-not-available` / `error` synchronously before the promise
  // resolves, so the flag is visible to event handlers without leaking to
  // the background poll.
  private userInitiatedCheckActive = false;
  private firstCheckTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  getStatus(): UpdateStatus {
    return this.currentStatus;
  }

  getDownloadedFilePath(): string | null {
    return this.downloadedFilePath;
  }

  init(getWindow: () => BrowserWindow | null): void {
    if (!app.isPackaged) return;
    if (this.initialized) return;
    this.initialized = true;

    this.getMainWindow = getWindow;

    // On macOS we route install through our own script and trigger
    // download manually; on Windows/Linux the artifact is unusable
    // without manual replacement. So autoDownload stays off everywhere.
    autoUpdater.autoDownload = false;
    autoUpdater.channel = 'latest';
    autoUpdater.allowPrerelease = false;
    // Stay on electron-updater's default (false). If we ever add a beta
    // toggle, the channel switch should set this true only for the
    // single transition so stable users do not silently get downgraded.
    autoUpdater.allowDowngrade = false;
    // We trigger install through our own IPC flow so Squirrel.Mac never
    // races with `before-quit`. The macOS bypass relies on the
    // downloaded zip surviving past `app.quit()`.
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => {
      this.sendStatus({ state: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      this.pendingVersion = info.version;
      this.sendStatus({
        state: 'available',
        version: info.version,
        releaseNotes:
          typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
        externalDownloadOnly: EXTERNAL_DOWNLOAD_ONLY,
      });
    });

    autoUpdater.on('update-not-available', () => {
      if (this.userInitiatedCheckActive) {
        this.sendStatus({ state: 'not-available' });
      } else {
        // Reset the cached status so getStatus() does not return a stale
        // `checking` from a background poll the renderer never asked for.
        this.currentStatus = { state: 'idle' };
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      // Without a known version (e.g., progress resumed after a process
      // restart before `update-available` fires), drop the event rather
      // than render an empty version label.
      if (!this.pendingVersion) return;
      this.sendStatus({
        state: 'downloading',
        percent: Math.round(progress.percent),
        version: this.pendingVersion,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.downloadedFilePath = info.downloadedFile;
      this.sendStatus({ state: 'downloaded', version: info.version });
    });

    autoUpdater.on('error', (err) => {
      const code = (err as { code?: string }).code;
      let feedURL: string | null | undefined;
      try {
        feedURL = autoUpdater.getFeedURL();
      } catch {
        feedURL = undefined;
      }
      debugUpdater(
        'updater.error code=%s platform=%s/%s feedURL=%s userInitiated=%s message=%s',
        code ?? 'unknown',
        process.platform,
        process.arch,
        feedURL ?? 'unknown',
        this.userInitiatedCheckActive,
        err.message,
      );

      if (code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') {
        if (this.userInitiatedCheckActive) {
          this.sendStatus({ state: 'not-available' });
        } else {
          this.currentStatus = { state: 'idle' };
        }
        return;
      }

      this.sendStatus({ state: 'error', message: err.message });
    });

    this.firstCheckTimer = setTimeout(() => {
      this.firstCheckTimer = null;
      void this.backgroundCheck();
    }, BACKGROUND_POLL_FIRST_DELAY_MS);

    this.pollTimer = setInterval(() => {
      void this.backgroundCheck();
    }, BACKGROUND_POLL_INTERVAL_MS);
  }

  async checkUserInitiated(): Promise<unknown> {
    this.userInitiatedCheckActive = true;
    try {
      return await autoUpdater.checkForUpdates();
    } finally {
      this.userInitiatedCheckActive = false;
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  dispose(): void {
    if (this.firstCheckTimer) {
      clearTimeout(this.firstCheckTimer);
      this.firstCheckTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    autoUpdater.removeAllListeners();
    this.initialized = false;
  }

  private async backgroundCheck(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // The 'error' event handler already surfaces a status; swallow the
      // promise rejection so the unhandled-rejection logger stays quiet.
    }
  }

  private sendStatus(status: UpdateStatus): void {
    this.currentStatus = status;
    const win = this.getMainWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.updaterStatus, status);
    }
  }
}

export const studioUpdater = new StudioUpdater();
export { autoUpdater };
