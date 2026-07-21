import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, () => void>();
  const stream = {
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return stream;
    }),
    write: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
  };
  const createWriteStream = vi.fn(() => stream);

  return {
    createWriteStream,
    debugFn: vi.fn(),
    listeners,
    stream,
  };
});

vi.mock('debug', () => ({
  default: vi.fn(() => mocks.debugFn),
}));

vi.mock('node:fs', () => ({
  default: {
    createWriteStream: mocks.createWriteStream,
  },
  createWriteStream: mocks.createWriteStream,
}));

vi.mock('../../src/common', () => ({
  getMidsceneRunSubDir: vi.fn(() => '/tmp/midscene-log'),
}));

vi.mock('../../src/utils', () => ({
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
