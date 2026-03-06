import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkXvfbInstalled,
  findAvailableDisplay,
  needsXvfb,
} from '../../src/xvfb';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('not found');
  }),
  spawn: vi.fn(),
}));

describe('needsXvfb', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should return false on non-Linux platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(needsXvfb(true)).toBe(false);
  });

  it('should return false on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(needsXvfb(true)).toBe(false);
  });

  it('should return true on Linux with explicit true', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(needsXvfb(true)).toBe(true);
  });

  it('should return false on Linux with explicit false', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(needsXvfb(false)).toBe(false);
  });

  it('should return false on Linux without explicit option', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(needsXvfb()).toBe(false);
    expect(needsXvfb(undefined)).toBe(false);
  });
});

describe('findAvailableDisplay', () => {
  it('should return startFrom when no lock files exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(findAvailableDisplay(99)).toBe(99);
  });

  it('should skip occupied display numbers', () => {
    vi.mocked(existsSync)
      .mockReturnValueOnce(true) // :99 occupied
      .mockReturnValueOnce(true) // :100 occupied
      .mockReturnValueOnce(false); // :101 free
    expect(findAvailableDisplay(99)).toBe(101);
  });

  it('should throw if no display is available', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(() => findAvailableDisplay(99)).toThrow(
      'No available display number found',
    );
  });
});

describe('checkXvfbInstalled', () => {
  it('should return false when Xvfb is not installed', () => {
    expect(checkXvfbInstalled()).toBe(false);
  });

  it('should return true when Xvfb is installed', async () => {
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from('/usr/bin/Xvfb'));
    expect(checkXvfbInstalled()).toBe(true);
  });
});
