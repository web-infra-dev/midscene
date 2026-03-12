import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDownloadedScrcpyServer } from '../../src/scrcpy-server-cache.mjs';
import {
  SCRCPY_PROTOCOL_VERSION,
  SCRCPY_SERVER_VERSION_TAG,
  shouldDownloadScrcpyServer,
} from '../../src/scrcpy-version.mjs';

const tempDirs = [];

describe('scrcpy server version helper', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dirPath) => fs.rm(dirPath, { force: true, recursive: true })),
    );
  });

  it('uses a single hard-coded scrcpy version for runtime and server download', () => {
    const runtimeVersion = new AdbScrcpyOptions3_3_3({
      audio: false,
      control: false,
    }).version;

    expect(SCRCPY_PROTOCOL_VERSION).toBe('3.3.3');
    expect(SCRCPY_SERVER_VERSION_TAG).toBe('v3.3.3');
    expect(runtimeVersion).toBe(SCRCPY_PROTOCOL_VERSION);
  });

  it('forces a refresh when cached version metadata is missing or stale', () => {
    expect(shouldDownloadScrcpyServer(null, 'v3.3.3')).toBe(true);
    expect(shouldDownloadScrcpyServer('v3.3.4', 'v3.3.3')).toBe(true);
    expect(shouldDownloadScrcpyServer(' v3.3.3\n', 'v3.3.3')).toBe(false);
  });

  it('replaces the cached server only after the new download is ready', async () => {
    const dirPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-scrcpy-server-'),
    );
    tempDirs.push(dirPath);

    const serverBinPath = path.join(dirPath, 'scrcpy-server');
    const downloadedFile = path.join(dirPath, 'scrcpy-server-v3.3.3');

    await fs.writeFile(serverBinPath, 'old-server');
    await fs.writeFile(downloadedFile, 'new-server');

    await installDownloadedScrcpyServer({
      serverBinPath,
      downloadedFile,
    });

    await expect(fs.readFile(serverBinPath, 'utf8')).resolves.toBe(
      'new-server',
    );
    await expect(fs.access(downloadedFile)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('restores the cached server if swapping in the new binary fails', async () => {
    const dirPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-scrcpy-server-'),
    );
    tempDirs.push(dirPath);

    const serverBinPath = path.join(dirPath, 'scrcpy-server');
    const downloadedFile = path.join(dirPath, 'scrcpy-server-v3.3.3');
    const backupFilePath = `${serverBinPath}.bak`;

    await fs.writeFile(serverBinPath, 'old-server');
    await fs.writeFile(downloadedFile, 'new-server');

    const rename = vi.fn(async (fromPath, toPath) => {
      if (fromPath === downloadedFile && toPath === serverBinPath) {
        throw new Error('rename failed');
      }
      return fs.rename(fromPath, toPath);
    });

    await expect(
      installDownloadedScrcpyServer({
        fsApi: {
          access: fs.access,
          rename,
          rm: fs.rm,
        },
        serverBinPath,
        downloadedFile,
      }),
    ).rejects.toThrow('rename failed');

    await expect(fs.readFile(serverBinPath, 'utf8')).resolves.toBe(
      'old-server',
    );
    await expect(fs.access(backupFilePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
