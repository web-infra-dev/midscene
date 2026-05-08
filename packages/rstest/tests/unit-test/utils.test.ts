import { describe, expect, it } from '@rstest/core';
import { MANIFEST_DIR, generateTimestamp, manifestKey } from '../../src/utils';

describe('utils', () => {
  it('MANIFEST_DIR points under midscene_run', () => {
    expect(MANIFEST_DIR).toBe('midscene_run/.rstest-manifest');
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

  it('generateTimestamp formats as YYYYMMDD-HHmmssSSS', () => {
    const ts = generateTimestamp();
    expect(ts).toMatch(/^\d{8}-\d{9}$/);
  });
});
