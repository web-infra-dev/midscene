import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../src/shared/updater-contract';

const mocks = vi.hoisted(() => ({
  homeDir: '/tmp',
}));

vi.mock('electron', () => ({
  app: {
    getName: () => 'Midscene Studio',
    getPath: (name: string) =>
      name === 'home' ? mocks.homeDir : path.join(mocks.homeDir, name),
    isPackaged: true,
    quit: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

afterEach(() => {
  mocks.homeDir = '/tmp';
});

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: 'latest',
    allowPrerelease: false,
    allowDowngrade: false,
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    getFeedURL: vi.fn(() => 'https://example.com'),
  },
}));

describe('shellQuote', () => {
  it('wraps simple strings in single quotes', async () => {
    const { shellQuote } = await import('../src/main/updater-handlers');
    expect(shellQuote('/Applications/Midscene Studio.app')).toBe(
      `'/Applications/Midscene Studio.app'`,
    );
  });

  it("escapes embedded single quotes with the POSIX '\\'' idiom", async () => {
    const { shellQuote } = await import('../src/main/updater-handlers');
    expect(shellQuote("it's mine")).toBe(`'it'\\''s mine'`);
  });

  it('handles consecutive single quotes', async () => {
    const { shellQuote } = await import('../src/main/updater-handlers');
    expect(shellQuote("a''b")).toBe(`'a'\\'''\\''b'`);
  });
});

describe('buildMacUpdateScript', () => {
  const baseOptions = {
    appPath: '/Applications/Midscene Studio.app',
    execName: 'Midscene Studio',
    zipPath: '/tmp/midscene/Midscene-Studio-darwin-arm64.zip',
    tempDir: '/tmp/midscene-studio-update',
    scriptPath: '/tmp/midscene-studio-update.sh',
    logPath: '/tmp/midscene-studio-update.log',
  };

  it('produces a runnable bash script with all paths quoted', async () => {
    const { buildMacUpdateScript } = await import(
      '../src/main/updater-handlers'
    );
    const script = buildMacUpdateScript(baseOptions);
    expect(script.startsWith('#!/bin/bash\n')).toBe(true);
    expect(script).toContain(`APP_PATH='/Applications/Midscene Studio.app'`);
    expect(script).toContain(`EXEC_NAME='Midscene Studio'`);
    // Critical guard: refuse to mv into a path that still exists.
    expect(script).toContain('if [ -e "$APP_PATH" ]');
    expect(script).toContain('/bin/rm -rf "$APP_PATH"');
    expect(script).toContain('/bin/mv "$APP_BUNDLE" "$APP_PATH"');
    expect(script).toContain(
      '/usr/bin/find "$TEMP_DIR" -maxdepth 2 -name "*.app"',
    );
    // Liveness verification so we know the new binary actually launches.
    expect(script).toContain('kill -0 $LAUNCH_PID');
  });

  it('escapes single quotes in app paths so the script stays valid bash', async () => {
    const { buildMacUpdateScript } = await import(
      '../src/main/updater-handlers'
    );
    const script = buildMacUpdateScript({
      ...baseOptions,
      appPath: "/Users/x/it's mine.app",
    });
    expect(script).toContain(`APP_PATH='/Users/x/it'\\''s mine.app'`);
    // Make sure the quoting did not accidentally break later usages.
    expect(script).toContain('APP_CONTENTS_PATH="$APP_PATH/Contents/"');
  });
});

describe('updater handlers', () => {
  it('finds downloads under the configured updater cache directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-updater-'));
    mocks.homeDir = root;

    try {
      const zipPath = path.join(
        root,
        'Library',
        'Caches',
        'midscene-studio-updater',
        'pending',
        'midscene-studio-v1.8.1-darwin-arm64.zip',
      );
      await fs.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.writeFile(zipPath, 'zip');

      const { findDownloadedMacUpdateZip } = await import(
        '../src/main/updater-handlers'
      );
      const updater = {
        getDownloadedFilePath: () => null,
      };

      await expect(findDownloadedMacUpdateZip(updater as never)).resolves.toBe(
        zipPath,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

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
