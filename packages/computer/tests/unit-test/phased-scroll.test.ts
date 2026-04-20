import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ensurePhasedScrollBinaryExecutable,
  getPhasedScrollBinary,
} from '../../src/device';

describe('phased-scroll binary resolution', () => {
  it('returns null on non-darwin platforms', () => {
    if (process.platform === 'darwin') {
      // On darwin the binary is expected to exist, so we can't assert null
      // without dangerous process.platform stubbing. Validate the positive
      // case instead: the committed universal binary resolves and exists.
      const p = getPhasedScrollBinary();
      expect(p).toBeTypeOf('string');
      expect(existsSync(p as string)).toBe(true);
      expect(p).toContain('bin/darwin/phased-scroll');
      return;
    }
    expect(getPhasedScrollBinary()).toBeNull();
  });

  it('resolves under the package root regardless of module layout', () => {
    if (process.platform !== 'darwin') return;
    const binPath = getPhasedScrollBinary() as string;
    // Must live inside packages/computer/bin/darwin/, not a nested dist copy.
    const pkgRoot = resolve(__dirname, '../..');
    expect(binPath.startsWith(pkgRoot)).toBe(true);
    expect(binPath.endsWith('bin/darwin/phased-scroll')).toBe(true);
  });

  it('repairs execute permissions when install packaging strips them', () => {
    if (process.platform === 'win32') return;

    const sourceBinary =
      getPhasedScrollBinary() ??
      resolve(__dirname, '../../bin/darwin/phased-scroll');
    expect(existsSync(sourceBinary)).toBe(true);

    const tempDir = mkdtempSync(join(tmpdir(), 'midscene-phased-scroll-'));
    const copiedBinary = join(tempDir, 'phased-scroll');

    try {
      copyFileSync(sourceBinary, copiedBinary);
      chmodSync(copiedBinary, 0o644);
      expect(statSync(copiedBinary).mode & 0o111).toBe(0);

      expect(ensurePhasedScrollBinaryExecutable(copiedBinary)).toBe(true);
      expect(statSync(copiedBinary).mode & 0o111).not.toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
