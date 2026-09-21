import { describe, expect, it, rs } from '@rstest/core';

const mocks = rs.hoisted(() => {
  const listeners = new Map<string, () => void>();
  const stream = {
    end: rs.fn(),
    on: rs.fn(),
    once: rs.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return stream;
    }),
    write: rs.fn().mockReturnValueOnce(false).mockReturnValue(true),
  };
  const createWriteStream = rs.fn(() => stream);

  return {
    createWriteStream,
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
    createWriteStream: mocks.createWriteStream,
  },
  createWriteStream: mocks.createWriteStream,
}));

rs.mock('../../src/common', () => ({
  getMidsceneRunSubDir: rs.fn(() => '/tmp/midscene-log'),
}));

rs.mock('../../src/utils', () => ({
  ifInNode: true,
}));

import { getDebug, setLogDirectoryResolver } from '../../src/logger';

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

  it('uses a configured process-local directory and switches files when it changes', () => {
    setLogDirectoryResolver(() => '/tmp/studio-log/2026-07-21');
    const debugLog = getDebug('logger:studio-directory');

    debugLog('first');
    expect(mocks.createWriteStream).toHaveBeenLastCalledWith(
      '/tmp/studio-log/2026-07-21/logger-studio-directory.log',
      { flags: 'a' },
    );
    expect(mocks.stream.write).toHaveBeenCalled();
    expect(mocks.stream.end).toHaveBeenCalled();

    setLogDirectoryResolver(() => '/tmp/studio-log/2026-07-22');
    debugLog('second');

    expect(mocks.createWriteStream).toHaveBeenLastCalledWith(
      '/tmp/studio-log/2026-07-22/logger-studio-directory.log',
      { flags: 'a' },
    );
    expect(mocks.stream.end).toHaveBeenCalledTimes(2);
    setLogDirectoryResolver(undefined);
  });
});
