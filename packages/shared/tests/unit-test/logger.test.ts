import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debugFn: vi.fn(),
}));

vi.mock('debug', () => ({
  default: vi.fn(() => mocks.debugFn),
}));

vi.mock('../../src/utils', () => ({
  ifInNode: false,
}));

import { getDebug } from '../../src/logger';

describe('getDebug', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.debugFn.mockClear();
  });

  it('does not throw when console logging cannot write', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('write EIO');
    });
    const debugLog = getDebug('logger:test', { console: true });

    expect(() => {
      debugLog('android scan failed:', new Error('adb unavailable'));
    }).not.toThrow();

    expect(mocks.debugFn).toHaveBeenCalledWith(
      'android scan failed:',
      expect.any(Error),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[Midscene]',
      'android scan failed:',
      expect.any(Error),
    );
  });
});
