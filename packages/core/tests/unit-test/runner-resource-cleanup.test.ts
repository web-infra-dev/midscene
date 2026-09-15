import {
  ResourceCleanupDeferredError,
  assertResourceAvailable,
  cleanupResources,
  cleanupScopeResources,
  createDocumentRuntime,
  createProjectRuntime,
  createResourceScope,
  defineNode,
  getResourceCleanupCompletion,
  linkResourceSignal,
  runWorkflowDocument,
  trackResourceOperation,
} from '@/test-runner';
import {
  enterYamlAction,
  runInYamlExecutionContext,
} from '@/yaml/execution-session';
import { ScriptPlayer } from '@/yaml/player';
import { collectLegacyYamlDocument } from '@/yaml/test-runner-compat';
import { afterEach, describe, expect, rs, test } from '@rstest/core';

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
afterEach(() => {
  rs.useRealTimers();
});

describe('resource-aware cancellation cleanup', () => {
  test('concurrent finish calls share one document and Project cleanup', async () => {
    const gate = deferred();
    const cleanup = rs.fn(() => gate.promise);
    const project = {
      projectId: 'project',
      name: 'project',
      platform: 'web' as const,
      retry: 0,
      tags: { include: [], exclude: [] },
      variables: {},
    };
    const runtime = createProjectRuntime({
      project,
      setup: {
        name: 'fixture',
        setup({ onTeardown }) {
          onTeardown(cleanup);
        },
      },
    });
    await runtime.start();
    const first = runtime.finish();
    const second = runtime.finish();
    gate.resolve();
    expect(await first).toBe(await second);
    expect(cleanup).toHaveBeenCalledTimes(1);

    const document = collectLegacyYamlDocument({ tasks: [] });
    document.lifecycle.afterAll = [
      { node: 'cleanup', input: {}, meta: { continueOnError: false } },
    ];
    const node = defineNode({ name: 'cleanup', execute: cleanup });
    const documentRuntime = createDocumentRuntime(document, {
      resolveNode: () => node,
    });
    await documentRuntime.start();
    const documentFirst = documentRuntime.finish();
    const documentSecond = documentRuntime.finish();
    expect(await documentFirst).toBe(await documentSecond);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
  test('quarantines a canceled resource and reports bounded cleanup deferral', async () => {
    const action = deferred();
    const resource = {};
    const controller = new AbortController();
    trackResourceOperation(resource, action.promise, controller.signal);
    controller.abort();
    expect(() => assertResourceAvailable(resource)).toThrow('Cannot reuse');
    const cleanup = rs.fn(async () => {});
    const error = await cleanupResources([resource], cleanup, {
      graceMs: 5,
      onDeferredError: rs.fn(),
    }).catch((error) => error);
    expect(error).toBeInstanceOf(ResourceCleanupDeferredError);
    expect(error.code).toBe('RESOURCE_CLEANUP_DEFERRED');
    expect(cleanup).not.toHaveBeenCalled();
    expect(() => assertResourceAvailable(resource)).toThrow(
      'cleanup is pending',
    );
    action.resolve();
    await getResourceCleanupCompletion(resource);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => assertResourceAvailable(resource)).not.toThrow();
  });

  test.each([false, true])(
    'keeps an asynchronous disposer quarantined with a pending operation: %s',
    async (hasPendingOperation) => {
      const action = deferred();
      const destruction = deferred();
      const destructionStarted = deferred();
      const resource = {};
      const signal = new AbortController().signal;
      if (hasPendingOperation)
        trackResourceOperation(resource, action.promise, signal);
      const cleanup = cleanupResources(
        [resource],
        async () => {
          destructionStarted.resolve();
          await destruction.promise;
        },
        { onDeferredError: rs.fn() },
      );
      action.resolve();
      await destructionStarted.promise;
      expect(() => assertResourceAvailable(resource, true)).toThrow(
        'cleanup is pending',
      );
      destruction.resolve();
      await cleanup;
      expect(() => assertResourceAvailable(resource, true)).not.toThrow();
    },
  );

  test('only the cleanup hook can use its retiring resource', async () => {
    const action = deferred();
    const resource = {};
    const resourceScope = createResourceScope();
    const scope = resourceScope.signal;
    const sibling = new AbortController().signal;
    linkResourceSignal(sibling, scope);
    trackResourceOperation(resource, action.promise, scope);
    const cleanup = cleanupScopeResources(scope, async () => {}, {
      onDeferredError: rs.fn(),
      beforeCleanup: async (cleanupSignal) => {
        const stepSignal = new AbortController().signal;
        linkResourceSignal(stepSignal, cleanupSignal);
        expect(() =>
          assertResourceAvailable(resource, true, stepSignal),
        ).not.toThrow();
        expect(() => assertResourceAvailable(resource, true, scope)).toThrow(
          'cleanup is pending',
        );
        expect(() => assertResourceAvailable(resource, true, sibling)).toThrow(
          'cleanup is pending',
        );
        action.resolve();
        await action.promise;
        // Agent.destroy() can nest inside scope cleanup without releasing the
        // surrounding owner's protection.
        await cleanupResources([resource], async () => {}, {
          onDeferredError: rs.fn(),
        });
        expect(() => assertResourceAvailable(resource, true)).toThrow(
          'cleanup is pending',
        );
      },
    });
    await cleanup;
    resourceScope.dispose();
  });

  test('completed child scopes do not quarantine their old resources during parent cleanup', async () => {
    const parent = createResourceScope();
    const child = createResourceScope(parent.signal);
    const resource = {};
    await trackResourceOperation(resource, Promise.resolve(), child.signal);
    child.dispose();
    await cleanupScopeResources(
      parent.signal,
      async () => {
        expect(() => assertResourceAvailable(resource, true)).not.toThrow();
      },
      { onDeferredError: rs.fn() },
    );
    parent.dispose();
  });

  test.each(['afterEach', 'afterAll'] as const)(
    'waits for an actual %s action before disposing its resource',
    async (phase) => {
      rs.useFakeTimers();
      const action = deferred();
      const resource = {};
      const calls: string[] = [];
      const document = collectLegacyYamlDocument({
        tasks: [{ name: 'case', flow: [{ javascript: 'run' }] }],
      });
      const step = document.cases[0].definition.steps[0];
      document.lifecycle[phase] = [step];
      if (phase === 'afterAll') document.lifecycle.beforeAll = [step];
      const node = defineNode({
        name: 'javascript',
        async execute(ctx) {
          const currentPhase =
            ctx.scope === 'case' ? ctx.case.phase : ctx.document.phase;
          if (currentPhase === phase) {
            assertResourceAvailable(resource, true, ctx.signal);
            calls.push('hook:start');
            await trackResourceOperation(resource, action.promise, ctx.signal);
            calls.push('hook:finished');
          } else if (
            (phase === 'afterEach' && currentPhase === 'steps') ||
            (phase === 'afterAll' && currentPhase === 'beforeAll')
          ) {
            ctx.onTeardown(() => {
              calls.push('dispose');
            });
            await trackResourceOperation(
              resource,
              Promise.resolve(),
              ctx.signal,
            );
          }
        },
      });
      const execution = runWorkflowDocument(document, {
        resolveNode: () => node,
        defaultTimeoutMs: 10,
      });
      await rs.advanceTimersByTimeAsync(1100);
      const result = await execution;
      const owner =
        phase === 'afterEach' ? result.cases[0].run! : result.document;
      const error = owner.teardownErrors?.[0]
        .cause as ResourceCleanupDeferredError;
      expect(error).toBeInstanceOf(ResourceCleanupDeferredError);
      expect(calls).toEqual(['hook:start']);
      expect(() => assertResourceAvailable(resource, true)).toThrow(
        'cleanup is pending',
      );
      const snapshot = JSON.stringify(result);
      action.resolve();
      await rs.waitFor(() =>
        expect(calls).toEqual(['hook:start', 'hook:finished', 'dispose']),
      );
      expect(calls).toEqual(['hook:start', 'hook:finished', 'dispose']);
      expect(JSON.stringify(result)).toBe(snapshot);
    },
  );

  test('observes late operation rejection and late cleanup failure without unhandled rejection', async () => {
    const action = deferred();
    const resource = {};
    const controller = new AbortController();
    trackResourceOperation(resource, action.promise, controller.signal);
    controller.abort();
    const failure = new Error('late cleanup failed');
    const reportFailure = rs.fn();
    await cleanupResources(
      [resource],
      async () => {
        throw failure;
      },
      { graceMs: 5, onDeferredError: reportFailure },
    ).catch((error) => error);
    action.reject(new Error('late action failed'));
    await expect(getResourceCleanupCompletion(resource)).rejects.toBe(failure);
    expect(reportFailure).toHaveBeenCalledWith(failure);
  });

  test('parents wait for deferred child cleanup, not just the original operation', async () => {
    const action = deferred();
    const childCleanup = deferred();
    const parentSignal = new AbortController().signal;
    const childSignal = new AbortController().signal;
    linkResourceSignal(childSignal, parentSignal);
    trackResourceOperation({}, action.promise, childSignal);
    await cleanupScopeResources(childSignal, () => childCleanup.promise, {
      graceMs: 5,
      onDeferredError: rs.fn(),
    }).catch((error) => error);
    const closeParent = rs.fn(async () => {});
    await cleanupScopeResources(parentSignal, closeParent, {
      graceMs: 5,
      onDeferredError: rs.fn(),
    }).catch((error) => error);
    action.resolve();
    await Promise.resolve();
    expect(closeParent).not.toHaveBeenCalled();
    childCleanup.resolve();
    await getResourceCleanupCompletion(childSignal);
    await getResourceCleanupCompletion(parentSignal);
    expect(closeParent).toHaveBeenCalledTimes(1);
  });

  test.each(['steps', 'afterEach'] as const)(
    'Case, document and Project cleanup remain ordered after %s defers them',
    async (phase) => {
      rs.useFakeTimers();
      const action = deferred();
      const resource = {};
      const calls: string[] = [];
      const project = {
        projectId: 'project',
        name: 'project',
        platform: 'web' as const,
        retry: 0,
        tags: { include: [], exclude: [] },
        variables: {},
      };
      const runtime = createProjectRuntime({
        project,
        setup: {
          name: 'fixture',
          setup({ onTeardown }) {
            onTeardown(() => {
              calls.push('project');
            });
          },
        },
      });
      await runtime.start();
      const document = collectLegacyYamlDocument({
        tasks: [{ name: 'case', flow: [{ javascript: 'wait' }] }],
      });
      const step = document.cases[0].definition.steps[0];
      document.lifecycle.afterAll = [step];
      if (phase === 'afterEach') document.lifecycle.afterEach = [step];
      const node = defineNode({
        name: 'javascript',
        execute(ctx) {
          if (ctx.scope === 'document') {
            assertResourceAvailable(resource, true, ctx.signal);
            calls.push('document');
            return;
          }
          if (ctx.case.phase === 'steps') {
            ctx.onTeardown(() => {
              calls.push('case');
            });
            if (phase === 'afterEach') {
              runtime.abort(new Error('interrupted'));
              return;
            }
          }
          return trackResourceOperation(resource, action.promise, ctx.signal);
        },
      });
      const execution = runWorkflowDocument(document, {
        resolveNode: () => node,
        signal: runtime.signal,
        defaultTimeoutMs: 10,
      });
      await rs.advanceTimersByTimeAsync(2100);
      const result = await execution;
      expect(result.cases[0].run?.teardownErrors?.[0].cause).toBeInstanceOf(
        ResourceCleanupDeferredError,
      );
      expect(result.document.teardownErrors?.[0].cause).toBeInstanceOf(
        ResourceCleanupDeferredError,
      );
      const finish = runtime.finish('failed');
      await rs.advanceTimersByTimeAsync(1100);
      const projectResult = await finish;
      expect(projectResult.teardownErrors?.[0].cause).toBeInstanceOf(
        ResourceCleanupDeferredError,
      );
      expect(calls).toEqual(['document']);
      const snapshot = JSON.stringify(result);
      action.resolve();
      await getResourceCleanupCompletion(runtime.signal);
      expect(calls).toEqual(['document', 'case', 'project']);
      expect(JSON.stringify(result)).toBe(snapshot);
    },
  );

  test('ScriptPlayer returns a failed record on deferral and frees only after the action settles', async () => {
    rs.useFakeTimers();
    const action = deferred();
    const cleanup = rs.fn(async () => {});
    const agent = {
      getActionSpace: async () => [],
      evaluateJavaScript: () => action.promise,
    };
    const player = new ScriptPlayer(
      { tasks: [{ name: 'case', flow: [{ javascript: 'wait' }] }] },
      async () => ({
        agent: agent as any,
        freeFn: [{ name: 'resource', fn: cleanup }],
      }),
    );
    player.output = undefined;
    const controller = new AbortController();
    // Nested YAML inherits its owning Node's signal without public run options.
    const execution = runInYamlExecutionContext(async () => {
      const leaveAction = enterYamlAction(agent, controller.signal);
      try {
        return await player.run();
      } finally {
        leaveAction();
      }
    }).catch((error) => error);
    await rs.advanceTimersByTimeAsync(10);
    controller.abort(new Error('owning Node timed out'));
    await rs.advanceTimersByTimeAsync(1100);
    const error = await execution;
    expect(error).toBeInstanceOf(ResourceCleanupDeferredError);
    expect(player.executionRecord).toMatchObject({
      status: 'failed',
      cleanupErrors: [{ code: 'RESOURCE_CLEANUP_DEFERRED' }],
    });
    expect(getResourceCleanupCompletion(player)).toBeInstanceOf(Promise);
    expect(error).not.toHaveProperty('completion');
    expect(cleanup).not.toHaveBeenCalled();
    action.resolve();
    await getResourceCleanupCompletion(player);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
