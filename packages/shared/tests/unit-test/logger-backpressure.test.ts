import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, () => void>();
  const stream = {
    on: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return stream;
    }),
    write: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
  };

  return {
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
    createWriteStream: vi.fn(() => mocks.stream),
  },
  createWriteStream: vi.fn(() => mocks.stream),
}));

vi.mock('../../src/common', () => ({
  getMidsceneRunSubDir: vi.fn(() => '/tmp/midscene-log'),
}));

vi.mock('../../src/utils', () => ({
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
