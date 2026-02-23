import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
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

function clearDisplay() {
  process.env.DISPLAY = '';
}

describe('needsXvfb', () => {
  const originalPlatform = process.platform;
  const originalDisplay = process.env.DISPLAY;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalDisplay !== undefined) {
      process.env.DISPLAY = originalDisplay;
    } else {
      clearDisplay();
    }
  });

  it('should return false on non-Linux platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(needsXvfb()).toBe(false);
  });

  it('should return false on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(needsXvfb()).toBe(false);
  });

  it('should respect explicit true on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    expect(needsXvfb(true)).toBe(true);
  });

  it('should respect explicit false on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    clearDisplay();
    expect(needsXvfb(false)).toBe(false);
  });

  it('should return true on Linux without DISPLAY when all deps available', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    clearDisplay();
    const { execSync } = await import('node:child_process');
    // Mock all dependency checks to succeed (Xvfb, xrandr, import)
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from('/usr/bin/Xvfb'))
      .mockReturnValueOnce(Buffer.from('/usr/bin/xrandr'))
      .mockReturnValueOnce(Buffer.from('/usr/bin/import'));
    expect(needsXvfb()).toBe(true);
  });

  it('should return false on Linux without DISPLAY when xrandr missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    clearDisplay();
    const { execSync } = await import('node:child_process');
    // Xvfb exists but xrandr doesn't
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from('/usr/bin/Xvfb'))
      .mockImplementationOnce(() => {
        throw new Error('not found');
      });
    expect(needsXvfb()).toBe(false);
  });

  it('should return false on Linux without DISPLAY when Xvfb not installed', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    clearDisplay();
    // execSync throws by default (Xvfb not found)
    expect(needsXvfb()).toBe(false);
  });

  it('should return false on Linux with DISPLAY', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    expect(needsXvfb()).toBe(false);
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
    // execSync is mocked to throw by default
    expect(checkXvfbInstalled()).toBe(false);
  });

  it('should return true when Xvfb is installed', async () => {
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from('/usr/bin/Xvfb'));
    expect(checkXvfbInstalled()).toBe(true);
  });
});
