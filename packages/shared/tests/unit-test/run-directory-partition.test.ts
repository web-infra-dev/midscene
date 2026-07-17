import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMidsceneRunSubDir } from '../../src/common';

describe('Midscene run directory date partitions', () => {
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'midscene-partition-'));
    vi.stubEnv('MIDSCENE_RUN_DIR', rootPath);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(rootPath, { recursive: true, force: true });
  });

  it('partitions volatile Studio artifacts by local date', () => {
    vi.stubEnv('MIDSCENE_RUN_DATE_PARTITIONS', '1');

    expect(getMidsceneRunSubDir('report')).toMatch(
      /\/report\/\d{4}-\d{2}-\d{2}$/,
    );
    expect(getMidsceneRunSubDir('log')).toMatch(/\/log\/\d{4}-\d{2}-\d{2}$/);
    expect(getMidsceneRunSubDir('cache')).toBe(path.join(rootPath, 'cache'));
  });

  it('keeps the legacy flat layout when partitioning is disabled', () => {
    vi.stubEnv('MIDSCENE_RUN_DATE_PARTITIONS', '0');

    expect(getMidsceneRunSubDir('report')).toBe(path.join(rootPath, 'report'));
  });
});
