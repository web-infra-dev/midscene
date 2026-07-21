import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getManifestDir,
  manifestKey,
  resetManifestDirCache,
} from '../../src/utils';

describe('utils', () => {
  const originalRunDir = process.env.MIDSCENE_RUN_DIR;

  afterEach(() => {
    resetManifestDirCache();
    if (originalRunDir === undefined) {
      Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
    } else {
      process.env.MIDSCENE_RUN_DIR = originalRunDir;
    }
  });

  it('getManifestDir lives under the Midscene run dir and respects MIDSCENE_RUN_DIR', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDir;
    resetManifestDirCache();
    expect(getManifestDir()).toBe(join(runDir, 'tmp', 'rstest-manifest'));
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

  it('caches the resolved dir until it is explicitly reset', () => {
    const runDir = join(tmpdir(), `midscene-rstest-utils-a-${process.pid}`);
    process.env.MIDSCENE_RUN_DIR = runDir;
    resetManifestDirCache();
    const first = getManifestDir();

    process.env.MIDSCENE_RUN_DIR = join(
      tmpdir(),
      `midscene-rstest-utils-b-${process.pid}`,
    );
    expect(getManifestDir()).toBe(first);

    resetManifestDirCache();
    expect(getManifestDir()).not.toBe(first);
  });
});
