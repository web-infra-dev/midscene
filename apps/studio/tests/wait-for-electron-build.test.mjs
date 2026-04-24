import { describe, expect, it } from 'vitest';
import {
  createFreshBuildChecker,
  waitForBuild,
} from '../scripts/wait-for-electron-build.mjs';

const FILE_A = '/fake/main.cjs';
const FILE_B = '/fake/preload.cjs';

const readerFrom = (mtimes) => (file) =>
  mtimes.has(file) ? mtimes.get(file) : null;

describe('createFreshBuildChecker', () => {
  it('returns false when any required file is missing at the moment of the check', () => {
    const mtimes = new Map([[FILE_A, 100]]);
    const isFresh = createFreshBuildChecker(
      [FILE_A, FILE_B],
      readerFrom(mtimes),
    );

    expect(isFresh()).toBe(false);
  });

  it('returns false when every file existed at startup and no mtime has moved forward', () => {
    const mtimes = new Map([
      [FILE_A, 100],
      [FILE_B, 200],
    ]);
    const isFresh = createFreshBuildChecker(
      [FILE_A, FILE_B],
      readerFrom(mtimes),
    );

    expect(isFresh()).toBe(false);
  });

  it('returns true when a file that was absent at startup now exists and the rest are strictly newer', () => {
    const mtimes = new Map([[FILE_A, 100]]);
    const read = readerFrom(mtimes);
    const isFresh = createFreshBuildChecker([FILE_A, FILE_B], read);

    expect(isFresh()).toBe(false);

    mtimes.set(FILE_B, 200);
    mtimes.set(FILE_A, 300);

    expect(isFresh()).toBe(true);
  });

  it('stays false until every required file has a strictly newer mtime', () => {
    const mtimes = new Map([
      [FILE_A, 100],
      [FILE_B, 200],
    ]);
    const read = readerFrom(mtimes);
    const isFresh = createFreshBuildChecker([FILE_A, FILE_B], read);

    mtimes.set(FILE_A, 150);
    expect(isFresh()).toBe(false);

    mtimes.set(FILE_B, 250);
    expect(isFresh()).toBe(true);
  });

  it('returns false if a previously present file disappears mid-poll', () => {
    const mtimes = new Map([
      [FILE_A, 100],
      [FILE_B, 200],
    ]);
    const read = readerFrom(mtimes);
    const isFresh = createFreshBuildChecker([FILE_A, FILE_B], read);

    mtimes.delete(FILE_A);

    expect(isFresh()).toBe(false);
  });

  it('does not treat an equal mtime as fresh (regression guard for the dropped freshness window)', () => {
    const mtimes = new Map([[FILE_A, 500]]);
    const read = readerFrom(mtimes);
    const isFresh = createFreshBuildChecker([FILE_A], read);

    // Mtime unchanged — the previous implementation had a 3s "freshness
    // window" fallback that would mark this as fresh. The fix drops that
    // fallback, so equal-mtime must stay false.
    expect(isFresh()).toBe(false);
  });

  it('propagates non-ENOENT read errors instead of treating them as missing files', () => {
    // Regression guard: readMtimeMs narrows its catch to ENOENT so real IO
    // errors (permission denied, disk failure, ...) surface instead of being
    // silently reinterpreted as "file not built yet". If someone widens the
    // catch back to `catch {}`, this test must break.
    const throwingReader = () => {
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    };

    expect(() => createFreshBuildChecker([FILE_A], throwingReader)).toThrow(
      /permission denied/,
    );
  });
});

describe('waitForBuild', () => {
  const makeVirtualClock = () => {
    let tick = 0;
    return {
      now: () => tick,
      delay: async (ms) => {
        tick += ms;
      },
      advance: (ms) => {
        tick += ms;
      },
    };
  };

  it('resolves true as soon as the build is fresh and the renderer is ready', async () => {
    const mtimes = new Map();
    const read = readerFrom(mtimes);
    const clock = makeVirtualClock();

    const promise = waitForBuild({
      requiredFiles: [FILE_A],
      maxWaitMs: 10000,
      pollIntervalMs: 250,
      readMtime: read,
      isRendererReady: async () => true,
      now: clock.now,
      delay: clock.delay,
    });

    // File appears right after the checker's initial snapshot.
    mtimes.set(FILE_A, 42);

    await expect(promise).resolves.toBe(true);
  });

  it('resolves false after maxWaitMs elapses with a perpetually stale build', async () => {
    const staleMtimes = new Map([[FILE_A, 100]]);
    const read = readerFrom(staleMtimes);
    const clock = makeVirtualClock();

    const result = await waitForBuild({
      requiredFiles: [FILE_A],
      maxWaitMs: 1000,
      pollIntervalMs: 500,
      readMtime: read,
      isRendererReady: async () => true,
      now: clock.now,
      delay: clock.delay,
    });

    expect(result).toBe(false);
  });

  it('keeps polling while the renderer is not yet serving after the build becomes fresh', async () => {
    const mtimes = new Map();
    const read = readerFrom(mtimes);
    const clock = makeVirtualClock();

    let rendererReadyCalls = 0;
    const isRendererReady = async () => {
      rendererReadyCalls += 1;
      return rendererReadyCalls >= 3;
    };

    const resultPromise = waitForBuild({
      requiredFiles: [FILE_A],
      maxWaitMs: 10000,
      pollIntervalMs: 250,
      readMtime: read,
      isRendererReady,
      now: clock.now,
      delay: clock.delay,
    });

    // File appears right after the checker's initial snapshot, so the build is
    // fresh from the first poll onward.
    mtimes.set(FILE_A, 1);

    const result = await resultPromise;

    expect(result).toBe(true);
    expect(rendererReadyCalls).toBe(3);
  });
});
