import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  YADB_VERSION,
  downloadYadbReleaseAsset,
  getYadbDownloadUrl,
} from '../../scripts/download-yadb.mjs';

const tempDirs: string[] = [];

describe('yadb download script', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dirPath) => fs.rm(dirPath, { force: true, recursive: true })),
    );
  });

  it('uses the public GitHub release asset URL for yadb', () => {
    expect(getYadbDownloadUrl(YADB_VERSION)).toBe(
      'https://github.com/ysbing/YADB/releases/download/v1.1.1/yadb',
    );
  });

  it('downloads yadb directly from the release asset URL', async () => {
    const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-yadb-'));
    tempDirs.push(dirPath);

    const destinationPath = path.join(dirPath, 'yadb');
    const dispatcher = { kind: 'proxy-dispatcher' };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('yadb-binary').buffer,
      status: 200,
      statusText: 'OK',
    }));

    await downloadYadbReleaseAsset({
      destinationPath,
      dispatcher,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      version: YADB_VERSION,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://github.com/ysbing/YADB/releases/download/v1.1.1/yadb',
      { dispatcher },
    );
    await expect(fs.readFile(destinationPath, 'utf8')).resolves.toBe(
      'yadb-binary',
    );
  });

  it('falls back to the GitHub asset API when the browser download URL fails', async () => {
    const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-yadb-'));
    tempDirs.push(dirPath);

    const destinationPath = path.join(dirPath, 'yadb');
    const apiAssetUrl =
      'https://api.github.com/repos/ysbing/YADB/releases/assets/392259748';
    const fetchImpl = vi.fn(async (url: string) => {
      if (
        url === 'https://github.com/ysbing/YADB/releases/download/v1.1.1/yadb'
      ) {
        return {
          ok: false,
          status: 504,
          statusText: 'Gateway Time-out',
        };
      }

      if (
        url === 'https://api.github.com/repos/ysbing/YADB/releases/tags/v1.1.1'
      ) {
        return {
          ok: true,
          json: async () => ({
            assets: [{ name: 'yadb', url: apiAssetUrl }],
          }),
          status: 200,
          statusText: 'OK',
        };
      }

      if (url === apiAssetUrl) {
        return {
          ok: true,
          arrayBuffer: async () =>
            new TextEncoder().encode('yadb-binary').buffer,
          status: 200,
          statusText: 'OK',
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await downloadYadbReleaseAsset({
      dispatcher: undefined,
      destinationPath,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      version: YADB_VERSION,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/ysbing/YADB/releases/tags/v1.1.1',
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(3, apiAssetUrl, {
      headers: { Accept: 'application/octet-stream' },
    });
    await expect(fs.readFile(destinationPath, 'utf8')).resolves.toBe(
      'yadb-binary',
    );
  });

  it('throws when the browser URL and API metadata fallback both fail', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    }));

    await expect(
      downloadYadbReleaseAsset({
        dispatcher: undefined,
        destinationPath: path.join(os.tmpdir(), 'midscene-yadb-should-fail'),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(
      'Failed to download yadb: browser download failed: Response code 502 (Bad Gateway); API metadata fallback failed: Response code 502 (Bad Gateway)',
    );
  });
});
