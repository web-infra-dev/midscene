export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | {
      state: 'available';
      version: string;
      releaseNotes?: string;
      externalDownloadOnly?: boolean;
    }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number; version: string }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

/**
 * Platforms where electron-updater cannot apply the update in-place and the
 * user must download the next release manually. Linux ships as a plain zip
 * from @electron/packager; the updater only knows how to relaunch
 * AppImage/DEB/RPM-style targets. Windows publishes an NSIS setup.exe, so
 * NsisUpdater can keep the normal download + quitAndInstall path there.
 */
export function isExternalDownloadOnlyPlatform(
  platform: NodeJS.Platform,
): boolean {
  return platform === 'linux';
}

export interface UpdaterApi {
  check: () => Promise<unknown>;
  download: () => Promise<{ success: boolean; error?: string }>;
  install: () => Promise<void>;
  getVersion: () => Promise<string>;
  getStatus: () => Promise<UpdateStatus>;
  onStatus: (callback: (status: UpdateStatus) => void) => () => void;
}
