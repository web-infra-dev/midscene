import { getDebug } from '@midscene/shared/logger';
import { IPC_CHANNELS } from '@shared/electron-contract';
import type { UpdateChannel, UpdateStatus } from '@shared/updater-contract';
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

let getMainWindow: (() => BrowserWindow | null) | null = null;
let isUserInitiatedCheck = false;
let pendingVersion: string | null = null;
let currentStatus: UpdateStatus = { state: 'idle' };
let currentChannel: UpdateChannel = 'stable';

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

function normalizeUpdateChannel(channel?: string): UpdateChannel {
  return channel === 'beta' ? 'beta' : 'stable';
}

function toUpdaterChannel(channel: UpdateChannel): 'latest' | 'beta' {
  return channel === 'beta' ? 'beta' : 'latest';
}

export function getUpdateChannel(): UpdateChannel {
  return currentChannel;
}

export function setUserInitiatedCheck(value: boolean): void {
  isUserInitiatedCheck = value;
}

function sendStatus(status: UpdateStatus): void {
  currentStatus = status;
  const win = getMainWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.updaterStatus, status);
  }
}

let downloadedFilePath: string | null = null;

export function getDownloadedFilePath(): string | null {
  return downloadedFilePath;
}

export function setUpdateChannel(channel?: string): UpdateChannel {
  currentChannel = normalizeUpdateChannel(channel);
  autoUpdater.channel = toUpdaterChannel(currentChannel);
  autoUpdater.allowPrerelease = currentChannel === 'beta';
  autoUpdater.allowDowngrade = true;
  return currentChannel;
}

export function initUpdater(
  getWindow: () => BrowserWindow | null,
  autoDownload = false,
  updateChannel: UpdateChannel = 'stable',
): void {
  if (!app.isPackaged) return;

  getMainWindow = getWindow;

  // Auto-download controlled by user setting (default: false). On Windows
  // the artifact is unusable without manual replacement, so never auto-download.
  autoUpdater.autoDownload = EXTERNAL_DOWNLOAD_ONLY ? false : autoDownload;
  // We trigger install through our own IPC flow so Squirrel.Mac never
  // races with `before-quit`. The macOS bypass below relies on the
  // downloaded zip surviving past `app.quit()`.
  autoUpdater.autoInstallOnAppQuit = false;
  setUpdateChannel(updateChannel);

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    pendingVersion = info.version;
    sendStatus({
      state: 'available',
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      externalDownloadOnly: EXTERNAL_DOWNLOAD_ONLY,
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (isUserInitiatedCheck) {
      sendStatus({ state: 'not-available' });
    } else {
      // Reset the cached status so getStatus() does not return a stale
      // `checking` from a background poll the renderer never asked for.
      currentStatus = { state: 'idle' };
    }
    isUserInitiatedCheck = false;
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      version: pendingVersion || '',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    downloadedFilePath = info.downloadedFile;
    sendStatus({ state: 'downloaded', version: info.version });
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
      'updater.error code=%s platform=%s/%s channel=%s feedURL=%s userInitiated=%s message=%s',
      code ?? 'unknown',
      process.platform,
      process.arch,
      currentChannel,
      feedURL ?? 'unknown',
      isUserInitiatedCheck,
      err.message,
    );

    if (code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') {
      if (isUserInitiatedCheck) {
        sendStatus({ state: 'not-available' });
      } else {
        currentStatus = { state: 'idle' };
      }
      isUserInitiatedCheck = false;
      return;
    }

    sendStatus({ state: 'error', message: err.message });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);

  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    30 * 60 * 1000,
  );
}

export function setAutoDownload(enabled: boolean): void {
  autoUpdater.autoDownload = EXTERNAL_DOWNLOAD_ONLY ? false : enabled;
}

export { autoUpdater };
