import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RUN_ID_ENV,
  ensureRunId,
  getManifestDir,
  manifestKey,
} from '../../src/utils';

describe('utils', () => {
  const originalRunDir = process.env.MIDSCENE_RUN_DIR;
  const originalRunId = process.env[RUN_ID_ENV];

  afterEach(() => {
    if (originalRunDir === undefined) {
      Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
    } else {
      process.env.MIDSCENE_RUN_DIR = originalRunDir;
    }
    if (originalRunId === undefined) {
      Reflect.deleteProperty(process.env, RUN_ID_ENV);
    } else {
      process.env[RUN_ID_ENV] = originalRunId;
    }
  });

  it('getManifestDir lives under the Midscene run dir and respects MIDSCENE_RUN_DIR', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDir;
    process.env[RUN_ID_ENV] = 'run-a';
    expect(getManifestDir()).toBe(
      join(runDir, 'tmp', 'rstest-manifest', 'run-a'),
    );
  });

  it('getManifestDir re-resolves instead of caching, so it survives a removed dir', () => {
    process.env[RUN_ID_ENV] = 'run-a';
    const runDirA = join(tmpdir(), `midscene-rstest-utils-a-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDirA;
    expect(getManifestDir()).toBe(
      join(runDirA, 'tmp', 'rstest-manifest', 'run-a'),
    );

    const runDirB = join(tmpdir(), `midscene-rstest-utils-b-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDirB;
    expect(getManifestDir()).toBe(
      join(runDirB, 'tmp', 'rstest-manifest', 'run-a'),
    );
  });

  // The whole point of the namespace: `MidsceneReporter` clears its manifest
  // directory at run start, so two rstest processes sharing one project must
  // not share one directory.
  it('getManifestDir separates concurrent runs by run id', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-c-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDir;

    process.env[RUN_ID_ENV] = 'run-a';
    const first = getManifestDir();
    process.env[RUN_ID_ENV] = 'run-b';
    const second = getManifestDir();

    expect(first).not.toBe(second);
  });

  it('getManifestDir falls back to a fixed bucket when no reporter minted an id', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-d-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDir;
    Reflect.deleteProperty(process.env, RUN_ID_ENV);

    expect(getManifestDir()).toBe(
      join(runDir, 'tmp', 'rstest-manifest', 'no-reporter'),
    );
  });

  it('ensureRunId mints once and publishes it to the environment', () => {
    Reflect.deleteProperty(process.env, RUN_ID_ENV);

    const id = ensureRunId();
    expect(id).toBeTruthy();
    expect(process.env[RUN_ID_ENV]).toBe(id);
  });

  // A worker inherits the id at spawn; re-evaluating the config there must not
  // replace it, or the worker would write where the reporter never looks.
  it('ensureRunId keeps an inherited id', () => {
    process.env[RUN_ID_ENV] = 'inherited-from-main';
    expect(ensureRunId()).toBe('inherited-from-main');
  });

  it('manifestKey is deterministic and 16-char hex', () => {
    const a = manifestKey('/abs/path/to/foo.test.ts');
    const b = manifestKey('/abs/path/to/foo.test.ts');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('manifestKey changes with input', () => {
    const a = manifestKey('/a.test.ts');
    const b = manifestKey('/b.test.ts');
    expect(a).not.toBe(b);
  });
});
