import { describe, expect, it } from 'vitest';
import { waitForRendererDeps } from '../scripts/wait-for-renderer-deps.mjs';

const FILE_A = '/fake/visualizer/index.mjs';
const FILE_B = '/fake/playground-app/index.mjs';

const readerFrom = (mtimes) => (file) =>
  mtimes.has(file) ? mtimes.get(file) : null;

describe('waitForRendererDeps', () => {
  const makeVirtualClock = () => {
    let tick = 0;
    return {
      now: () => tick,
      delay: async (ms) => {
        tick += ms;
      },
    };
  };

  it('resolves true once every renderer dependency file exists', async () => {
    const mtimes = new Map();
    const read = readerFrom(mtimes);
    const clock = makeVirtualClock();

    const promise = waitForRendererDeps({
      requiredFiles: [FILE_A, FILE_B],
      maxWaitMs: 10000,
      pollIntervalMs: 250,
      readMtime: read,
      now: clock.now,
      delay: clock.delay,
    });

    mtimes.set(FILE_A, 100);
    mtimes.set(FILE_B, 200);

    await expect(promise).resolves.toBe(true);
  });

  it('resolves false after maxWaitMs when a dependency never appears', async () => {
    const mtimes = new Map([[FILE_A, 100]]);
    const read = readerFrom(mtimes);
    const clock = makeVirtualClock();

    const result = await waitForRendererDeps({
      requiredFiles: [FILE_A, FILE_B],
      maxWaitMs: 1000,
      pollIntervalMs: 500,
      readMtime: read,
      now: clock.now,
      delay: clock.delay,
    });

    expect(result).toBe(false);
  });
});
