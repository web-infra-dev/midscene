import { describe, expect, it, rs } from '@rstest/core';

const mocks = rs.hoisted(() => {
  const listeners = new Map<string, () => void>();
  const stream = {
    on: rs.fn(),
    once: rs.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return stream;
    }),
    write: rs.fn().mockReturnValueOnce(false).mockReturnValue(true),
  };

  return {
    debugFn: rs.fn(),
    listeners,
    stream,
  };
});

rs.mock('debug', () => ({
  default: rs.fn(() => mocks.debugFn),
}));

rs.mock('node:fs', () => ({
  default: {
    createWriteStream: rs.fn(() => mocks.stream),
  },
  createWriteStream: rs.fn(() => mocks.stream),
}));

rs.mock('../../src/common', () => ({
  getMidsceneRunSubDir: rs.fn(() => '/tmp/midscene-log'),
}));

rs.mock('../../src/utils', () => ({
  ifInNode: true,
}));

import { getDebug } from '../../src/logger';

describe('file logger backpressure', () => {
  it('drops diagnostics while a file stream is backpressured and resumes after drain', () => {
    const debugLog = getDebug('logger:backpressure');

    debugLog('first');
    debugLog('dropped while disk is busy');

    expect(mocks.stream.write).toHaveBeenCalledTimes(1);
    expect(mocks.stream.once).toHaveBeenCalledWith(
      'drain',
      expect.any(Function),
    );

    mocks.listeners.get('drain')?.();
    debugLog('after drain');

    expect(mocks.stream.write).toHaveBeenCalledTimes(2);
  });
});
