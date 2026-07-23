import { describe, expect, it, vi } from 'vitest';
import type { ResolvedExecutionProject } from '../src/cli/test-project';
import { createProjectRuntime } from '../src/engine/project-runtime';

const project = (): ResolvedExecutionProject<{ lease: string }> => ({
  name: 'android-smoke',
  platform: 'android',
  tags: { include: [], exclude: [] },
  retry: 0,
  variables: {},
});

describe('project runtime', () => {
  it('runs setup once, exposes context only through the runtime, and tears down LIFO', async () => {
    const events: string[] = [];
    const setup = vi.fn(({ onTeardown }) => {
      events.push('setup');
      onTeardown(() => events.push('release-device'));
      onTeardown(() => events.push('stop-renewal'));
      return { lease: 'lease-1' };
    });
    const runtime = createProjectRuntime({
      project: project(),
      setup: { name: 'dora-android', platform: 'android', setup },
    });

    const started = await runtime.start();
    expect(runtime.context).toEqual({ lease: 'lease-1' });
    expect(runtime.canRun).toBe(true);
    expect(started).not.toHaveProperty('context');

    const finished = await runtime.finish();
    expect(finished).toMatchObject({ status: 'success' });
    expect(finished).not.toHaveProperty('context');
    expect(events).toEqual(['setup', 'stop-renewal', 'release-device']);
    expect(setup).toHaveBeenCalledOnce();
    await expect(runtime.start()).rejects.toThrow('already started');
  });

  it('cleans up registrations made before partial setup failure', async () => {
    const events: string[] = [];
    const runtime = createProjectRuntime({
      project: project(),
      setup: {
        name: 'dora-android',
        setup({ onTeardown }) {
          onTeardown(() => events.push('release'));
          throw new Error('connect failed');
        },
      },
    });

    const started = await runtime.start();
    expect(started).toMatchObject({
      status: 'failed',
      setupError: { code: 'PROJECT_SETUP_ERROR' },
    });
    expect(runtime.canRun).toBe(false);
    const finished = await runtime.finish();
    expect(events).toEqual(['release']);
    expect(finished.status).toBe('failed');
  });

  it('records teardown errors and continues remaining cleanup', async () => {
    const events: string[] = [];
    const runtime = createProjectRuntime({
      project: project(),
      setup: {
        name: 'dora-android',
        setup({ onTeardown }) {
          onTeardown(() => events.push('first'));
          onTeardown(() => {
            events.push('second');
            throw new Error('close failed');
          });
          return { lease: 'lease-1' };
        },
      },
    });

    await runtime.start();
    const result = await runtime.finish();
    expect(events).toEqual(['second', 'first']);
    expect(result).toMatchObject({
      status: 'failed',
      teardownErrors: [{ code: 'PROJECT_TEARDOWN_ERROR' }],
    });
  });

  it('does not acquire resources when already aborted', async () => {
    const setup = vi.fn(() => ({ lease: 'never' }));
    const controller = new AbortController();
    controller.abort(new Error('interrupted'));
    const runtime = createProjectRuntime({
      project: project(),
      setup: { name: 'dora-android', setup },
      signal: controller.signal,
    });

    expect(await runtime.start()).toMatchObject({ status: 'failed' });
    expect(runtime.canRun).toBe(false);
    expect(setup).not.toHaveBeenCalled();
    expect((await runtime.finish('failed')).status).toBe('failed');
  });
});
