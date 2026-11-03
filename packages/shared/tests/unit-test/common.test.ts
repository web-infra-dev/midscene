import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  getMidsceneRunBaseDir,
  getMidsceneRunDir,
  getMidsceneRunSubDir,
  resolveMidsceneRunDir,
  runWithMidsceneRunDir,
  setMidsceneRunDir,
} from '../../src/common';

describe('getMidsceneRunDir', () => {
  afterEach(() => {
    setMidsceneRunDir(undefined);
    rs.unstubAllEnvs();
  });

  it('resolves relative environment paths from the supplied project root', () => {
    const project = path.join(os.tmpdir(), 'project');
    rs.stubEnv('MIDSCENE_RUN_DIR', 'artifacts');
    expect(resolveMidsceneRunDir(project)).toBe(
      path.join(project, 'artifacts'),
    );
  });

  it('isolates concurrent and nested roots and restores the application default after errors', async () => {
    const application = path.join(os.tmpdir(), 'application');
    const nested = path.join(os.tmpdir(), 'nested');
    setMidsceneRunDir(application);
    const run = (root: string) =>
      runWithMidsceneRunDir(root, async () => {
        expect(getMidsceneRunDir()).toBe(root);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(getMidsceneRunDir()).toBe(root);
        expect(runWithMidsceneRunDir(nested, getMidsceneRunDir)).toBe(nested);
        expect(getMidsceneRunDir()).toBe(root);
      });
    await Promise.all([
      run(path.join(os.tmpdir(), 'project-a')),
      run(path.join(os.tmpdir(), 'project-b')),
    ]);
    expect(() =>
      runWithMidsceneRunDir('/failed', () => {
        throw new Error('test');
      }),
    ).toThrow('test');
    expect(getMidsceneRunDir()).toBe(application);
  });

  it('reports invalid roots and filesystem errors instead of using a different directory', async () => {
    expect(() => setMidsceneRunDir('  ')).toThrow('non-empty path');
    rs.stubEnv('MIDSCENE_RUN_DIR', '');
    expect(getMidsceneRunDir).toThrow('non-empty path');
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'midscene-root-conflict-'),
    );
    try {
      const file = path.join(root, 'file');
      await writeFile(file, 'keep this file');
      setMidsceneRunDir(file);
      expect(getMidsceneRunBaseDir).toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
