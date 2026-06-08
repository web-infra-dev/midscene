import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SCRCPY_PROTOCOL_VERSION,
  SCRCPY_SERVER_VERSION_TAG,
  downloadScrcpyServerReleaseAsset,
  getScrcpyServerDownloadUrl,
  installDownloadedScrcpyServer,
  shouldDownloadScrcpyServer,
} from '../../scripts/download-scrcpy-server.mjs';

const tempDirs: string[] = [];

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

  it('uses the public GitHub release asset URL for the scrcpy server', () => {
    expect(getScrcpyServerDownloadUrl('v3.3.3')).toBe(
      'https://github.com/Genymobile/scrcpy/releases/download/v3.3.3/scrcpy-server-v3.3.3',
    );
  });

  it('downloads the scrcpy server from the release asset URL directly', async () => {
    const dirPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-scrcpy-server-'),
    );
    tempDirs.push(dirPath);

    const destinationPath = path.join(dirPath, 'scrcpy-server-v3.3.3');
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('server-binary').buffer,
      status: 200,
      statusText: 'OK',
    }));

    await downloadScrcpyServerReleaseAsset({
      dispatcher: undefined,
      destinationPath,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      version: 'v3.3.3',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://github.com/Genymobile/scrcpy/releases/download/v3.3.3/scrcpy-server-v3.3.3',
      {},
    );
    await expect(fs.readFile(destinationPath, 'utf8')).resolves.toBe(
      'server-binary',
    );
  });

  it('falls back to the GitHub asset API when the browser download URL fails', async () => {
    const dirPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'midscene-scrcpy-server-'),
    );
    tempDirs.push(dirPath);

    const destinationPath = path.join(dirPath, 'scrcpy-server-v3.3.3');
    const apiAssetUrl =
      'https://api.github.com/repos/Genymobile/scrcpy/releases/assets/123';
    const fetchImpl = vi.fn(async (url: string) => {
      if (
        url ===
        'https://github.com/Genymobile/scrcpy/releases/download/v3.3.3/scrcpy-server-v3.3.3'
      ) {
        return {
          ok: false,
          status: 504,
          statusText: 'Gateway Time-out',
        };
      }

      if (
        url ===
        'https://api.github.com/repos/Genymobile/scrcpy/releases/tags/v3.3.3'
      ) {
        return {
          ok: true,
          json: async () => ({
            assets: [{ name: 'scrcpy-server-v3.3.3', url: apiAssetUrl }],
          }),
          status: 200,
          statusText: 'OK',
        };
      }

      if (url === apiAssetUrl) {
        return {
          ok: true,
          arrayBuffer: async () =>
            new TextEncoder().encode('server-binary').buffer,
          status: 200,
          statusText: 'OK',
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await downloadScrcpyServerReleaseAsset({
      dispatcher: undefined,
      destinationPath,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      version: 'v3.3.3',
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/Genymobile/scrcpy/releases/tags/v3.3.3',
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(3, apiAssetUrl, {
      headers: { Accept: 'application/octet-stream' },
    });
    await expect(fs.readFile(destinationPath, 'utf8')).resolves.toBe(
      'server-binary',
    );
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

    const rename = vi.fn(async (fromPath: string, toPath: string) => {
      if (fromPath === downloadedFile && toPath === serverBinPath) {
        throw new Error('rename failed');
      }
      return fs.rename(fromPath, toPath);
    });

    await expect(
      installDownloadedScrcpyServer({
        fsApi: {
          access: fs.access,
          rename: rename as unknown as typeof fs.rename,
          rm: fs.rm,
        } as unknown as typeof fs,
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
