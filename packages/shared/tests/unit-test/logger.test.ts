import { afterEach, describe, expect, it, rs } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  debugFn: rs.fn(),
}));

rs.mock('debug', () => ({
  default: rs.fn(() => mocks.debugFn),
}));

rs.mock('../../src/utils', () => ({
  ifInNode: false,
}));

import { getDebug } from '../../src/logger';

describe('getDebug', () => {
  afterEach(() => {
    rs.restoreAllMocks();
    mocks.debugFn.mockClear();
  });

  it('does not throw when console logging cannot write', () => {
    const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {
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
