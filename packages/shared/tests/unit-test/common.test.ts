import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getMidsceneRunDir,
  getMidsceneRunSubDir,
  setMidsceneRunDir,
} from '../../src/common';

describe('getMidsceneRunDir', () => {
  afterEach(() => {
    setMidsceneRunDir(undefined);
  });

  it('uses an explicit process-local run directory before the environment', () => {
    setMidsceneRunDir('/tmp/midscene-studio');

    expect(getMidsceneRunDir()).toBe('/tmp/midscene-studio');
  });

  it('uses the explicit process-local directory for output artifacts', async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), 'midscene-studio-'));
    try {
      setMidsceneRunDir(runDir);

      expect(getMidsceneRunSubDir('output')).toBe(path.join(runDir, 'output'));
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});
