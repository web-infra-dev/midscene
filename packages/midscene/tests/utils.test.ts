import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  getLogDir,
  getTmpDir,
  getTmpFile,
  overlapped,
  setLogDir,
  writeDumpReport,
} from '@/utils';
import { describe, expect, it } from 'vitest';

describe('utils', () => {
  it('tmpDir', () => {
    const testDir = getTmpDir();
    expect(typeof testDir).toBe('string');

    const testFile = getTmpFile('txt');
    expect(testFile.endsWith('.txt')).toBe(true);
  });

  it('log dir', () => {
    const dumpDir = getLogDir();
    expect(dumpDir).toBeTruthy();

    setLogDir(tmpdir());
    const dumpDir2 = getLogDir();
    expect(dumpDir2).toBe(tmpdir());
  });

  it('write report file', () => {
    const content = randomUUID();
    const reportPath = writeDumpReport('test', content);
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath, 'utf-8');
    expect(reportContent).contains(content);
  });

  it('write report file with attributes', () => {
    const content = randomUUID();
    const reportPath = writeDumpReport('test', [
      {
        dumpString: content,
        attributes: {
          foo: 'bar',
          hello: 'world',
        },
      },
    ]);
    expect(reportPath).toBeTruthy();
    const reportContent = readFileSync(reportPath, 'utf-8');
    expect(reportContent).contains(content);
    expect(reportContent).contains('foo="bar"');
    expect(reportContent).contains('hello="world"');
  });

  it('overlapped', () => {
    const container = { left: 100, top: 100, width: 100, height: 100 };
    const target = { left: 150, top: 150, width: 100, height: 100 };
    expect(overlapped(container, target)).toBeTruthy();

    const target2 = { left: 200, top: 200, width: 100, height: 100 };
    expect(overlapped(container, target2)).toBeFalsy();
  });
});
