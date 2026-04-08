import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMidsceneRunBaseDir } from '../../src/common';
import {
  persistReportFileName,
  readPersistedReportFileName,
} from '../../src/mcp/report-file-name';

describe('report file name state', () => {
  const stateFilePath = join(getMidsceneRunBaseDir(), 'current-report-name');

  afterEach(() => {
    if (existsSync(stateFilePath)) {
      rmSync(stateFilePath);
    }
  });

  it('should persist and read report file name', () => {
    persistReportFileName('report-a');
    expect(readPersistedReportFileName()).toBe('report-a');
  });

  it('should return undefined when no persisted report file name', () => {
    expect(readPersistedReportFileName()).toBeUndefined();
  });

  it('should throw when persisting an empty report file name', () => {
    expect(() => persistReportFileName('   ')).toThrow(
      /reportFileName must not be empty/,
    );
  });
});
