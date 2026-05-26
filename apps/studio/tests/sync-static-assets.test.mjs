import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncStaticAssets } from '../scripts/sync-static-assets.mjs';

let workDir;
let sourceDir;
let targetDir;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-sync-assets-'));
  sourceDir = path.join(workDir, 'assets');
  targetDir = path.join(workDir, 'dist/assets');
  await fs.mkdir(sourceDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(workDir, { force: true, recursive: true });
});

describe('syncStaticAssets', () => {
  it('copies every file from source into target', async () => {
    await fs.writeFile(path.join(sourceDir, 'a.png'), 'a');
    await fs.writeFile(path.join(sourceDir, 'b.png'), 'b');

    const returned = await syncStaticAssets({ sourceDir, targetDir });

    expect(returned).toBe(targetDir);
    expect(await fs.readFile(path.join(targetDir, 'a.png'), 'utf8')).toBe('a');
    expect(await fs.readFile(path.join(targetDir, 'b.png'), 'utf8')).toBe('b');
  });

  it('preserves nested directories', async () => {
    await fs.mkdir(path.join(sourceDir, 'nested'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'nested', 'c.png'), 'c');

    await syncStaticAssets({ sourceDir, targetDir });

    expect(
      await fs.readFile(path.join(targetDir, 'nested', 'c.png'), 'utf8'),
    ).toBe('c');
  });

  it('removes stale files that exist in target but are no longer in source', async () => {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'old.png'), 'stale');
    await fs.writeFile(path.join(sourceDir, 'new.png'), 'fresh');

    await syncStaticAssets({ sourceDir, targetDir });

    expect(await fs.readFile(path.join(targetDir, 'new.png'), 'utf8')).toBe(
      'fresh',
    );
    await expect(fs.access(path.join(targetDir, 'old.png'))).rejects.toThrow();
  });

  it('throws when the source directory does not exist', async () => {
    await fs.rm(sourceDir, { force: true, recursive: true });

    await expect(syncStaticAssets({ sourceDir, targetDir })).rejects.toThrow();
  });
});
