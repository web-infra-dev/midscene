import { getDumpDir, getTmpDir, getTmpFile, overlapped, setDumpDir } from '@/utils';
import { tmpdir } from 'os';
import { describe, it, expect } from 'vitest';

describe('utils', () => {
  it('tmpDir', () => {
    const testDir = getTmpDir();
    expect(typeof testDir).toBe('string');
  
    const testFile = getTmpFile('txt');
    expect(testFile.endsWith('.txt')).toBe(true);
  });

  it('dump dir', () => {
    const dumpDir = getDumpDir();
    expect(dumpDir).toBeTruthy();

    setDumpDir(tmpdir());
    const dumpDir2 = getDumpDir();
    expect(dumpDir2).toBe(tmpdir());
  });

  it('overlapped', () => {
    const container = { left: 100, top: 100, width: 100, height: 100 };
    const target = { left: 150, top: 150, width: 100, height: 100 };
    expect(overlapped(container, target)).toBeTruthy();

    const target2 = { left: 200, top: 200, width: 100, height: 100 };
    expect(overlapped(container, target2)).toBeFalsy();
  });

});