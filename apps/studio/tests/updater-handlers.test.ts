import { describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../src/shared/updater-contract';

vi.mock('electron', () => ({
  app: {
    getName: () => 'Midscene Studio',
    getPath: (name: string) => `/tmp/${name}`,
    isPackaged: true,
    quit: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: 'latest',
    allowPrerelease: false,
    allowDowngrade: false,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    getFeedURL: vi.fn(() => 'https://example.com'),
  },
}));

describe('updater handlers', () => {
  it('returns an available status from a raw electron-updater check result', async () => {
    const { resolveUpdaterCheckStatus } = await import(
      '../src/main/updater-handlers'
    );

    const status = resolveUpdaterCheckStatus(
      {
        updateInfo: {
          version: '1.8.1',
          releaseNotes: 'Bug fixes',
        },
      },
      { state: 'checking' },
      'win32',
    );

    expect(status).toEqual({
      state: 'available',
      version: '1.8.1',
      releaseNotes: 'Bug fixes',
      externalDownloadOnly: true,
    });
  });

  it('does not replace a status already promoted by updater events', async () => {
    const { resolveUpdaterCheckStatus } = await import(
      '../src/main/updater-handlers'
    );
    const currentStatus: UpdateStatus = {
      state: 'downloaded',
      version: '1.8.1',
    };

    expect(resolveUpdaterCheckStatus(null, currentStatus, 'darwin')).toBe(
      currentStatus,
    );
  });

  it('falls back to not available when the check result has no version', async () => {
    const { resolveUpdaterCheckStatus } = await import(
      '../src/main/updater-handlers'
    );

    expect(
      resolveUpdaterCheckStatus({ updateInfo: {} }, { state: 'checking' }),
    ).toEqual({ state: 'not-available' });
  });
});
