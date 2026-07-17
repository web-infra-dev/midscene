import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const streams: Array<{
    end: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    createWriteStream: vi.fn(() => {
      const stream = {
        end: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        write: vi.fn(() => true),
      };
      streams.push(stream);
      return stream;
    }),
    debugFn: vi.fn(),
    streams,
  };
});

vi.mock('debug', () => ({
  default: vi.fn(() => mocks.debugFn),
}));

vi.mock('node:fs', () => ({
  default: { createWriteStream: mocks.createWriteStream },
  createWriteStream: mocks.createWriteStream,
}));

vi.mock('../../src/common', () => ({
  getMidsceneRunSubDir: vi.fn(() => '/tmp/midscene-log/2026-07-17'),
}));

vi.mock('../../src/utils', () => ({ ifInNode: true }));

import { getDebug } from '../../src/logger';

describe('partitioned file logger rotation', () => {
  beforeEach(() => {
    vi.stubEnv('MIDSCENE_RUN_DATE_PARTITIONS', '1');
  });

  it('uses readable segment names and rotates before exceeding 20 MB', () => {
    const log = getDebug('rotation');

    log('small');
    log('x'.repeat(20 * 1024 * 1024));

    expect(mocks.createWriteStream).toHaveBeenCalledTimes(2);
    expect(mocks.createWriteStream.mock.calls[0][0]).toMatch(/rotation\.log$/);
    expect(mocks.createWriteStream.mock.calls[1][0]).toMatch(
      /rotation\.1\.log$/,
    );
    expect(mocks.streams[0].end).toHaveBeenCalledTimes(1);
  });
});
