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
      fetchImpl,
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

  it('throws on non-2xx responses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    }));

    await expect(
      downloadYadbReleaseAsset({
        destinationPath: path.join(os.tmpdir(), 'midscene-yadb-should-fail'),
        fetchImpl,
      }),
    ).rejects.toThrow('Response code 502 (Bad Gateway)');
  });
});
