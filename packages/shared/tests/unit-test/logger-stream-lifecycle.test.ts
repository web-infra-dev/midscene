import { once } from 'node:events';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { runWithMidsceneRunDir } from '../../src/common';
import { getDebug, setLogDirectoryResolver } from '../../src/logger';

describe('file logger with real streams across run directories', () => {
  let directory: string;
  let streams: fs.WriteStream[];
  let corkNextStream: boolean;

  const closeStreams = async () => {
    setLogDirectoryResolver(() => join(directory, 'unused'));
    setLogDirectoryResolver(undefined);
    await Promise.all(streams.map((stream) => finished(stream)));
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(join(tmpdir(), 'midscene-log-lifecycle-'));
    streams = [];
    corkNextStream = false;
    const createWriteStream = fs.createWriteStream;
    rs.spyOn(fs, 'createWriteStream').mockImplementation((...args) => {
      const stream = createWriteStream(...args);
      if (corkNextStream) {
        stream.cork();
        corkNextStream = false;
      }
      streams.push(stream);
      return stream;
    });
  });

  afterEach(async () => {
    await closeStreams();
    rs.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('resumes the original run after switching away from its backpressured stream', async () => {
    const log = getDebug('logger:lifecycle');
    const a = join(directory, 'a');
    const b = join(directory, 'b');
    runWithMidsceneRunDir(a, () =>
      log('large entry %s', 'x'.repeat(128 * 1024)),
    );
    expect(streams[0].writableNeedDrain).toBe(true);
    runWithMidsceneRunDir(b, () => log('other run'));
    await finished(streams[0]);
    runWithMidsceneRunDir(a, () => log('resumed original run'));
    await closeStreams();

    const file = 'logger-lifecycle.log';
    expect(fs.readFileSync(join(a, 'log', file), 'utf8')).toContain(
      'resumed original run',
    );
    expect(fs.readFileSync(join(b, 'log', file), 'utf8')).toContain(
      'other run',
    );
  });

  it('keeps pending log bytes bounded while switching between two busy runs', async () => {
    const log = getDebug('logger:bounded-switch');
    const roots = [join(directory, 'a'), join(directory, 'b')];
    for (let index = 0; index < 20; index += 1) {
      runWithMidsceneRunDir(roots[index % 2], () =>
        log('queued %s', 'x'.repeat(128 * 1024)),
      );
    }
    expect(streams).toHaveLength(2);
    expect(
      streams.reduce((bytes, stream) => bytes + stream.writableLength, 0),
    ).toBeLessThan(300 * 1024);
    await closeStreams();
  });

  it('does not let an old stream completion clear a newer stream backpressure', async () => {
    const log = getDebug('logger:stale-finish');
    const a = join(directory, 'a');
    runWithMidsceneRunDir(a, () => log('old %s', 'x'.repeat(128 * 1024)));
    runWithMidsceneRunDir(join(directory, 'b'), () => log('other run'));
    const old = streams[0];
    setLogDirectoryResolver(() => join(directory, 'unused'));
    setLogDirectoryResolver(undefined);
    corkNextStream = true;
    runWithMidsceneRunDir(a, () => log('new %s', 'x'.repeat(128 * 1024)));
    const current = streams[streams.length - 1];
    const queuedBytes = current.writableLength;
    await finished(old);
    runWithMidsceneRunDir(a, () => log('drop while new stream is busy'));
    expect(current.writableLength).toBe(queuedBytes);
    const drained = once(current, 'drain');
    current.uncork();
    await drained;
    runWithMidsceneRunDir(a, () => log('resumed after new stream drained'));
    await closeStreams();
    const content = fs.readFileSync(
      join(a, 'log', 'logger-stale-finish.log'),
      'utf8',
    );
    expect(content).not.toContain('drop while new stream is busy');
    expect(content).toContain('resumed after new stream drained');
  });
});
