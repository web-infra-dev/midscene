import { readFileSync, writeFileSync } from 'node:fs';
import { readSavedTargetId, saveTargetId } from '@/cdp-target-store';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('node:fs', () => ({
  existsSync: rs.fn(),
  readFileSync: rs.fn(),
  writeFileSync: rs.fn(),
  unlinkSync: rs.fn(),
}));

describe('CDP target persistence', () => {
  beforeEach(() => {
    rs.resetAllMocks();
  });

  it('returns null only when no target has been saved', () => {
    rs.mocked(readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });
    expect(readSavedTargetId()).toBeNull();
  });

  it('rejects unreadable and empty saved targets instead of selecting another page', () => {
    rs.mocked(readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    });
    expect(readSavedTargetId).toThrow('Failed to read CDP target ID');
    rs.mocked(readFileSync).mockReturnValue('  ');
    expect(readSavedTargetId).toThrow('is empty');
    rs.mocked(readFileSync).mockReturnValue(' target-1\n');
    expect(readSavedTargetId()).toBe('target-1');
  });

  it('propagates write errors so switch-tab cannot report false success', () => {
    const error = new Error('disk full');
    rs.mocked(writeFileSync).mockImplementation(() => {
      throw error;
    });
    expect(() => saveTargetId('target-2')).toThrow(
      'Failed to save CDP target ID',
    );
  });
});
