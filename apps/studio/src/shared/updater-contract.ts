export type UpdateChannel = 'stable' | 'beta';

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

export interface UpdaterApi {
  check: () => Promise<unknown>;
  download: () => Promise<{ success: boolean; error?: string }>;
  install: () => Promise<void>;
  getVersion: () => Promise<string>;
  getStatus: () => Promise<UpdateStatus>;
  setAutoDownload: (enabled: boolean) => Promise<{ success: boolean }>;
  setChannel: (channel: UpdateChannel) => Promise<UpdateChannel>;
  onStatus: (callback: (status: UpdateStatus) => void) => () => void;
}
