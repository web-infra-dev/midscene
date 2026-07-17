import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RunDirectoryManager } from '../src/main/run-directory-manager';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-17T12:00:00.000Z').getTime();

describe('RunDirectoryManager', () => {
  let rootPath: string;
  let manager: RunDirectoryManager;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'studio-run-manager-'));
    manager = new RunDirectoryManager(rootPath, () => NOW);
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  async function writeAgedFile(
    relativePath: string,
    ageDays: number,
    content = 'content',
  ) {
    const absolutePath = path.join(rootPath, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf-8');
    const modifiedAt = new Date(NOW - ageDays * DAY_MS);
    await utimes(absolutePath, modifiedAt, modifiedAt);
    return absolutePath;
  }

  it('removes expired managed files and preserves recent or unknown files', async () => {
    const expiredLog = await writeAgedFile('log/agent.log', 8);
    await writeAgedFile('log/recent.log', 2);
    await writeAgedFile('log/user-notes.txt', 60);
    const expiredReport = await writeAgedFile('report/web-old.html', 31);

    await manager.cleanup();

    await expect(readFile(expiredLog)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(expiredReport)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      readFile(path.join(rootPath, 'log/recent.log'), 'utf-8'),
    ).resolves.toBe('content');
    await expect(
      readFile(path.join(rootPath, 'log/user-notes.txt'), 'utf-8'),
    ).resolves.toBe('content');
  });

  it('enforces the log size cap after the 24-hour safety window', async () => {
    const oversizedLog = await writeAgedFile('log/oversized.log', 2);
    await truncate(oversizedLog, 201 * 1024 * 1024);
    const modifiedAt = new Date(NOW - 2 * DAY_MS);
    await utimes(oversizedLog, modifiedAt, modifiedAt);

    await manager.cleanup();
    await expect(readFile(oversizedLog)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('cleans date-partitioned reports after the fixed 30-day retention', async () => {
    await writeAgedFile('report/2026-06-01/expired.html', 31);
    await writeAgedFile('report/2026-06-18/recent.html', 29);

    await manager.cleanup();
    await expect(
      readFile(path.join(rootPath, 'report/2026-06-01/expired.html')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(path.join(rootPath, 'report/2026-06-18/recent.html'), 'utf-8'),
    ).resolves.toBe('content');
  });

  it('does not follow symbolic links while scanning managed directories', async () => {
    const outsidePath = await mkdtemp(
      path.join(tmpdir(), 'studio-run-outside-'),
    );
    try {
      await writeFile(path.join(outsidePath, 'keep.txt'), 'keep', 'utf-8');
      await mkdir(path.join(rootPath, 'log'), { recursive: true });
      await symlink(outsidePath, path.join(rootPath, 'log', 'linked.log'));

      await manager.cleanup();
      await expect(
        readFile(path.join(outsidePath, 'keep.txt'), 'utf-8'),
      ).resolves.toBe('keep');
    } finally {
      await rm(outsidePath, { recursive: true, force: true });
    }
  });
});
