import { getRunningPkgInfo } from '@/fs';
import { describe, expect, it } from 'vitest';

describe('fs', () => {
  it('getRunningPkgInfo', () => {
    const info = getRunningPkgInfo();
    expect(info).toBeDefined();
    expect(info?.dir).toMatch(/shared$/);
  });

  it('getRunningPkgInfo - no package.json', () => {
    const info = getRunningPkgInfo('/home');
    expect(info?.dir).toEqual('/home');
  });
});
