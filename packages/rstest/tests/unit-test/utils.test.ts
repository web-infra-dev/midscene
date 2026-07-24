import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getManifestDir, manifestKey } from '../../src/utils';

describe('utils', () => {
  const originalRunDir = process.env.MIDSCENE_RUN_DIR;

  afterEach(() => {
    if (originalRunDir === undefined) {
      Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
    } else {
      process.env.MIDSCENE_RUN_DIR = originalRunDir;
    }
  });

  it('getManifestDir lives under the Midscene run dir and respects MIDSCENE_RUN_DIR', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDir;
    expect(getManifestDir()).toBe(join(runDir, 'tmp', 'rstest-manifest'));
  });

  it('getManifestDir re-resolves instead of caching, so it survives a removed dir', () => {
    const runDirA = join(tmpdir(), `midscene-rstest-utils-a-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDirA;
    expect(getManifestDir()).toBe(join(runDirA, 'tmp', 'rstest-manifest'));

    const runDirB = join(tmpdir(), `midscene-rstest-utils-b-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDirB;
    expect(getManifestDir()).toBe(join(runDirB, 'tmp', 'rstest-manifest'));
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
