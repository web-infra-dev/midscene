import {
  ResourceCleanupDeferredError,
  cleanupScopeResources,
  createDocumentRuntime,
  createProjectRuntime,
  createResourceScope,
  getPendingScopeOperations,
  getResourceCleanupCompletion,
  getResourceCleanupSnapshot,
  trackResourceOperation,
} from '@/test-runner';
import { collectLegacyYamlDocument } from '@/yaml/test-runner-compat';
import { afterEach, describe, expect, rs, test } from '@rstest/core';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const project = {
  projectId: 'web',
  name: 'web',
  retry: 0,
  tags: { include: [], exclude: [] },
  variables: {},
};
afterEach(() => {
  rs.useRealTimers();
});

describe('file concurrency lifecycle deadlines', () => {
  test('keeps a late Project acquisition owned and accepts its late cleanup registration', async () => {
    rs.useFakeTimers();
    const acquisition = deferred();
    const calls: string[] = [];
    const runtime = createProjectRuntime({
      project,
      setupTimeoutMs: 10,
      teardownTimeoutMs: () => 20,
      setup: {
        name: 'late-browser',
        async setup({ onTeardown }) {
          onTeardown(() => {
            calls.push('first');
          });
          await acquisition.promise;
          onTeardown(() => {
            calls.push('late');
          });
          return { browser: 'ready' };
        },
      },
    });
    const starting = runtime.start();
    await rs.advanceTimersByTimeAsync(10);
    expect((await starting).setupError?.cause).toMatchObject({
      code: 'SETUP_TIMEOUT',
    });
    expect(runtime.canRun).toBe(false);
    const finishing = runtime.finish('failed');
    await rs.advanceTimersByTimeAsync(20);
    expect((await finishing).cleanup?.status).toBe('pending');
    expect(calls).toEqual([]);
    acquisition.resolve();
    await getResourceCleanupCompletion(runtime.signal);
    expect(calls).toEqual(['late', 'first']);
    expect(runtime.context).toEqual({ browser: 'ready' });
  });

  test('keeps a timed-out file acquisition until it settles, then disposes late resources in reverse order', async () => {
    rs.useFakeTimers();
    const acquisition = deferred();
    const calls: string[] = [];
    const document = collectLegacyYamlDocument({ tasks: [] });
    const runtime = createDocumentRuntime(document, {
      resolveNode: () => {
        throw new Error('No Nodes expected');
      },
      project,
      setupTimeoutMs: 10,
      teardownTimeoutMs: () => 20,
      documentSetup: {
        name: 'late-file',
        async setup({ onTeardown }) {
          onTeardown(() => {
            calls.push('first');
          });
          await acquisition.promise;
          onTeardown(() => {
            calls.push('late');
            throw new Error('late disposal failed');
          });
          return undefined;
        },
      },
    });
    const starting = runtime.start();
    await rs.advanceTimersByTimeAsync(10);
    expect((await starting).hostErrors?.[0].error).toMatchObject({
      code: 'SETUP_TIMEOUT',
    });
    expect(runtime.canRunCases).toBe(false);
    const finishing = runtime.finish();
    await rs.advanceTimersByTimeAsync(20);
    const snapshot = await finishing;
    expect(snapshot.cleanup?.status).toBe('pending');
    expect(calls).toEqual([]);
    acquisition.resolve();
    await expect(getResourceCleanupCompletion(runtime.signal)).rejects.toThrow(
      'Document cleanup failed',
    );
    expect(calls).toEqual(['late', 'first']);
    expect(snapshot.cleanup?.status).toBe('pending');
    expect(getResourceCleanupSnapshot(runtime.signal).status).toBe('failed');
  });

  test('uses one cleanup deadline for hooks, draining and disposal without resetting the clock', async () => {
    rs.useFakeTimers();
    const scope = createResourceScope();
    const hook = deferred();
    const action = deferred();
    const disposal = deferred();
    const calls: string[] = [];
    trackResourceOperation({}, action.promise, scope.signal);
    const cleanup = cleanupScopeResources(
      scope.signal,
      async () => {
        calls.push('dispose');
        await disposal.promise;
      },
      {
        totalTimeoutMs: 20,
        beforeCleanup: async () => {
          calls.push('hook');
          await hook.promise;
        },
        onDeferredError: rs.fn(),
      },
    ).catch((error) => error);
    await rs.advanceTimersByTimeAsync(7);
    hook.resolve();
    await rs.advanceTimersByTimeAsync(7);
    expect(calls).toEqual(['hook']);
    action.resolve();
    await rs.advanceTimersByTimeAsync(6);
    expect(await cleanup).toBeInstanceOf(ResourceCleanupDeferredError);
    expect(calls).toEqual(['hook', 'dispose']);
    expect(getResourceCleanupSnapshot(scope.signal).status).toBe('pending');
    disposal.resolve();
    await getResourceCleanupCompletion(scope.signal);
    expect(getResourceCleanupSnapshot(scope.signal).status).toBe('completed');
    scope.dispose();
  });

  test('cancellation returns from setup promptly while retaining the actual acquisition', async () => {
    const acquisition = deferred();
    const started = deferred();
    const parent = new AbortController();
    const close = rs.fn();
    const runtime = createProjectRuntime({
      project,
      signal: parent.signal,
      setupTimeoutMs: 1000,
      setup: {
        name: 'cancelled',
        async setup({ onTeardown }) {
          started.resolve();
          await acquisition.promise;
          onTeardown(close);
        },
      },
    });
    const starting = runtime.start();
    await started.promise;
    parent.abort(new Error('cancelled'));
    expect((await starting).status).toBe('failed');
    expect(getPendingScopeOperations(runtime.signal)).toHaveLength(1);
    const finishing = runtime.finish('failed');
    expect(close).not.toHaveBeenCalled();
    acquisition.resolve();
    await finishing;
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('requests cancellation of cleanup hooks at the cleanup deadline', async () => {
    rs.useFakeTimers();
    const scope = createResourceScope();
    const hook = deferred();
    let hookSignal: AbortSignal | undefined;
    const close = rs.fn(async () => {});
    const finishing = cleanupScopeResources(scope.signal, close, {
      totalTimeoutMs: 20,
      beforeCleanup: async (signal) => {
        hookSignal = signal;
        await hook.promise;
      },
      onDeferredError: rs.fn(),
    }).catch((error) => error);
    await rs.advanceTimersByTimeAsync(20);
    expect(await finishing).toBeInstanceOf(ResourceCleanupDeferredError);
    expect(hookSignal?.reason).toMatchObject({ code: 'TEARDOWN_TIMEOUT' });
    expect(close).not.toHaveBeenCalled();
    hook.resolve();
    await getResourceCleanupCompletion(scope.signal);
    expect(close).toHaveBeenCalledTimes(1);
    scope.dispose();
  });
});
