import { describe, expect, it } from 'vitest';
import { runTaskPool } from '../src/cli/task-scheduler';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('case task scheduler', () => {
  it('limits concurrency, respects resource locks, and preserves result order', async () => {
    const releaseAccount = deferred();
    const accountStarted = deferred();
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const tasks = [
      { id: 'account-first', resources: ['account:main'] },
      { id: 'account-second', resources: ['account:main'] },
      { id: 'independent', resources: [] },
    ];

    const run = runTaskPool({
      tasks,
      maxConcurrency: 2,
      run: async (task) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        events.push(`start:${task.id}`);
        if (task.id === 'account-first') {
          accountStarted.resolve();
          await releaseAccount.promise;
        }
        events.push(`end:${task.id}`);
        active -= 1;
        return task.id;
      },
    });

    await accountStarted.promise;
    await Promise.resolve();
    expect(events).toContain('start:independent');
    expect(events).not.toContain('start:account-second');
    releaseAccount.resolve();

    await expect(run).resolves.toEqual([
      'account-first',
      'account-second',
      'independent',
    ]);
    expect(maxActive).toBe(2);
  });

  it('stops claiming new work but drains active tasks', async () => {
    const release = deferred();
    let stop = false;
    const started: string[] = [];
    const run = runTaskPool({
      tasks: [
        { id: 'first', resources: [] },
        { id: 'second', resources: [] },
      ],
      maxConcurrency: 1,
      shouldStop: () => stop,
      run: async (task) => {
        started.push(task.id);
        stop = true;
        await release.promise;
        return task.id;
      },
    });

    await Promise.resolve();
    release.resolve();
    await expect(run).resolves.toEqual(['first', undefined]);
    expect(started).toEqual(['first']);
  });

  it('rejects after active work drains when an executor fails', async () => {
    const activeFinished = deferred();
    const run = runTaskPool({
      tasks: [
        { id: 'failed', resources: [] },
        { id: 'active', resources: [] },
        { id: 'not-started', resources: [] },
      ],
      maxConcurrency: 2,
      run: async (task) => {
        if (task.id === 'failed') throw new Error('executor failed');
        await Promise.resolve();
        activeFinished.resolve();
        return task.id;
      },
    });

    await activeFinished.promise;
    await expect(run).rejects.toThrow('executor failed');
  });

  it('releases resources and rejects when an executor throws synchronously', async () => {
    const started: string[] = [];
    const run = runTaskPool({
      tasks: [
        { id: 'failed', resources: ['account:main'] },
        { id: 'not-started', resources: ['account:main'] },
      ],
      maxConcurrency: 1,
      run: (task) => {
        started.push(task.id);
        throw new Error('synchronous executor failure');
      },
    });

    await expect(run).rejects.toThrow('synchronous executor failure');
    expect(started).toEqual(['failed']);
  });
});
