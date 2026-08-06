import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RUN_ID_ENV,
  ensureRunId,
  getManifestDir,
  manifestDirPath,
  manifestKey,
} from '../../src/utils';

describe('utils', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('manifestDirPath lives under the Midscene run dir and respects MIDSCENE_RUN_DIR', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-${process.pid}`);
    vi.stubEnv('MIDSCENE_RUN_DIR', runDir);
    vi.stubEnv(RUN_ID_ENV, 'run-a');
    expect(manifestDirPath()).toBe(
      join(runDir, 'tmp', 'rstest-manifest', 'run-a'),
    );
  });

  it('manifestDirPath re-resolves instead of caching, so it survives a removed dir', () => {
    vi.stubEnv(RUN_ID_ENV, 'run-a');
    const runDirA = join(tmpdir(), `midscene-rstest-utils-a-${process.pid}`);
    vi.stubEnv('MIDSCENE_RUN_DIR', runDirA);
    expect(manifestDirPath()).toBe(
      join(runDirA, 'tmp', 'rstest-manifest', 'run-a'),
    );

    const runDirB = join(tmpdir(), `midscene-rstest-utils-b-${process.pid}`);
    vi.stubEnv('MIDSCENE_RUN_DIR', runDirB);
    expect(manifestDirPath()).toBe(
      join(runDirB, 'tmp', 'rstest-manifest', 'run-a'),
    );
  });

  // Without a namespace the reporter's wholesale clear would reach a directory
  // shared with every concurrent rstest process, so there is no usable default.
  it('manifestDirPath refuses to resolve when no run id was claimed', () => {
    vi.stubEnv(RUN_ID_ENV, '');
    expect(() => manifestDirPath()).toThrow(/no manifest namespace/);
  });

  it('getManifestDir creates the directory manifestDirPath names', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-c-${process.pid}`);
    vi.stubEnv('MIDSCENE_RUN_DIR', runDir);
    vi.stubEnv(RUN_ID_ENV, 'run-a');
    expect(getManifestDir()).toBe(manifestDirPath());
  });

  it('ensureRunId claims once and publishes it to the environment', () => {
    vi.stubEnv(RUN_ID_ENV, '');
    const id = ensureRunId();
    expect(id).toBeTruthy();
    expect(process.env[RUN_ID_ENV]).toBe(id);
  });

  // A worker inherits the id at spawn; re-evaluating the config there must not
  // replace it, or the worker would write where the reporter never looks.
  it('ensureRunId keeps an inherited id', () => {
    vi.stubEnv(RUN_ID_ENV, 'inherited-from-main');
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
