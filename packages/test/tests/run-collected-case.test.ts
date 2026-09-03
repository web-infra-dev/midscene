import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CollectedCase,
  NodeRegistry,
  StepTimeoutError,
  defineNode,
  z,
} from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';

const step = (node: string, continueOnError = false, timeoutMs?: number) => ({
  node,
  input: {},
  meta: {
    continueOnError,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  },
});

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'test-id',
  projectId: 'project',
  sourcePath: 'flows/example.yaml',
  caseIndex: 2,
  definition: { name: 'example case', steps },
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runCollectedCase', () => {
  it('runs all attempt phases in order with one context and complete history', async () => {
    const context = { marker: 'document-context' };
    const calls: string[] = [];
    const node = defineNode<unknown, unknown, typeof context>({
      name: 'record',
      execute(ctx) {
        if (ctx.scope !== 'case') throw new Error('case scope required');
        calls.push(`${ctx.case.phase}:${ctx.case.stepIndex}`);
        expect(ctx.context).toBe(context);
        expect(Object.isFrozen(ctx.case.completedSteps)).toBe(true);
        expect(Object.isFrozen(ctx.case.completedNodes)).toBe(true);
        if (ctx.case.phase === 'beforeEach') {
          expect(ctx.case.completedSteps).toEqual([]);
          expect(ctx.case.completedNodes).toEqual([]);
        }
        if (ctx.case.phase === 'steps') {
          expect(ctx.case.completedSteps).toEqual([]);
          expect(ctx.case.completedNodes).toHaveLength(1);
        }
        if (ctx.case.phase === 'afterEach') {
          expect(ctx.case.completedSteps).toHaveLength(1);
          expect(ctx.case.completedNodes).toHaveLength(2);
        }
      },
    });
    const registry = new NodeRegistry([node]);

    const result = await runCollectedCase(collected([step(node.name)]), {
      beforeEach: [step(node.name)],
      afterEach: [step(node.name)],
      resolveNode: registry.require.bind(registry),
      context,
      createRunId: () => 'run-id',
    });

    expect(calls).toEqual(['beforeEach:0', 'steps:0', 'afterEach:0']);
    expect(result).toMatchObject({
      runId: 'run-id',
      status: 'success',
      beforeEach: [{ phase: 'beforeEach', stepIndex: 0 }],
      steps: [{ phase: 'steps', stepIndex: 0 }],
      afterEach: [{ phase: 'afterEach', stepIndex: 0 }],
    });
  });

  it('skips steps after any beforeEach failure but finishes that list and runs afterEach', async () => {
    const calls: string[] = [];
    const registry = new NodeRegistry([
      defineNode({
        name: 'before.fail',
        execute() {
          calls.push('before.fail');
          throw new Error('not ready');
        },
      }),
      defineNode({
        name: 'before.next',
        execute() {
          calls.push('before.next');
        },
      }),
      defineNode({
        name: 'body',
        execute() {
          calls.push('body');
        },
      }),
      defineNode({
        name: 'after',
        execute() {
          calls.push('after');
        },
      }),
    ]);

    const result = await runCollectedCase(collected([step('body')]), {
      beforeEach: [step('before.fail', true), step('before.next')],
      afterEach: [step('after')],
      resolveNode: registry.require.bind(registry),
    });

    expect(calls).toEqual(['before.fail', 'before.next', 'after']);
    expect(result.status).toBe('failed');
    expect(result.beforeEach).toHaveLength(2);
    expect(result.steps).toEqual([]);
    expect(result.afterEach).toHaveLength(1);
  });

  it('runs afterEach after a case step fails and preserves both errors', async () => {
    const registry = new NodeRegistry([
      defineNode({
        name: 'body.fail',
        execute() {
          throw new Error('body failed');
        },
      }),
      defineNode({
        name: 'after.fail',
        execute() {
          throw new Error('after failed');
        },
      }),
    ]);

    const result = await runCollectedCase(collected([step('body.fail')]), {
      afterEach: [step('after.fail')],
      resolveNode: registry.require.bind(registry),
    });

    expect(result.status).toBe('failed');
    expect(result.steps[0].error?.message).toContain('body failed');
    expect(result.afterEach[0].error?.message).toContain('after failed');
  });

  it('applies continue-on-error only within each phase', async () => {
    const next = vi.fn();
    const registry = new NodeRegistry([
      defineNode({
        name: 'fails',
        execute() {
          throw new Error('boom');
        },
      }),
      defineNode({ name: 'next', execute: next }),
    ]);

    const result = await runCollectedCase(
      collected([step('fails', true), step('next')]),
      { resolveNode: registry.require.bind(registry) },
    );

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(2);
    expect(next).toHaveBeenCalledOnce();
  });

  it('resolves every phase before running side effects and persists the result last', async () => {
    const execute = vi.fn();
    const onResult = vi.fn();
    const registry = new NodeRegistry([defineNode({ name: 'known', execute })]);

    await expect(
      runCollectedCase(collected([step('known')]), {
        beforeEach: [step('known')],
        afterEach: [step('missing')],
        resolveNode: registry.require.bind(registry),
        onResult,
      }),
    ).rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
    expect(execute).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();

    const result = await runCollectedCase(collected([step('known')]), {
      resolveNode: registry.require.bind(registry),
      onResult,
    });
    expect(onResult).toHaveBeenCalledWith(result);
  });

  it('runs node teardowns LIFO after failure and collects finalized reports', async () => {
    const calls: string[] = [];
    const registry = new NodeRegistry([
      defineNode({
        name: 'resource',
        execute({ onTeardown }) {
          onTeardown(() => {
            calls.push('release:first');
            return { reportPaths: [resolve('/tmp/first.html')] };
          });
          onTeardown(() => {
            calls.push('release:second');
            return { reportPaths: [resolve('/tmp/second.html')] };
          });
        },
      }),
      defineNode({
        name: 'fail',
        execute() {
          calls.push('fail');
          throw new Error('case failed');
        },
      }),
    ]);

    const result = await runCollectedCase(
      collected([step('resource'), step('fail')]),
      { resolveNode: registry.require.bind(registry) },
    );

    expect(calls).toEqual(['fail', 'release:second', 'release:first']);
    expect(result.status).toBe('failed');
    expect(result.reportPaths).toEqual([
      resolve('/tmp/second.html'),
      resolve('/tmp/first.html'),
    ]);
  });

  it('settles a non-cooperative running step on parent cancellation and runs cleanup', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    );
    const cancellationReason = new Error('workflow interrupted');
    const started = createDeferred();
    const registry = new NodeRegistry([
      defineNode({
        name: 'blocking',
        execute({ onTeardown }) {
          calls.push('step');
          onTeardown(() => {
            calls.push('teardown');
          });
          started.resolve();
          return new Promise<void>(() => {});
        },
      }),
      defineNode({
        name: 'after',
        execute() {
          calls.push('afterEach');
        },
      }),
    ]);

    const execution = runCollectedCase(
      collected([step('blocking', false, 60_000)]),
      {
        afterEach: [step('after')],
        resolveNode: registry.require.bind(registry),
        signal: controller.signal,
      },
    );
    await started.promise;

    let result: Awaited<typeof execution> | undefined;
    const settled = execution.then((value) => {
      result = value;
      return true;
    });
    controller.abort(cancellationReason);
    const observed = Promise.race([
      settled,
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 50)),
    ]);
    await vi.advanceTimersByTimeAsync(50);

    expect(await observed).toBe(true);
    expect(result?.steps[0].error).toMatchObject({
      code: 'NODE_EXECUTION_ERROR',
      cause: cancellationReason,
    });
    expect(calls).toEqual(['step', 'afterEach', 'teardown']);
    expect(vi.getTimerCount()).toBe(0);
    expect(removeAbortListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
    );
  });

  it('preserves a null parent cancellation reason', async () => {
    const controller = new AbortController();
    const started = createDeferred();
    const node = defineNode({
      name: 'null-cancellation-reason',
      execute() {
        started.resolve();
        return new Promise<void>(() => {});
      },
    });
    const registry = new NodeRegistry([node]);
    const execution = runCollectedCase(collected([step(node.name)]), {
      resolveNode: registry.require.bind(registry),
      signal: controller.signal,
    });
    await started.promise;

    controller.abort(null);
    const result = await execution;

    expect(result.steps[0].error).toMatchObject({
      code: 'NODE_EXECUTION_ERROR',
      cause: null,
    });
  });

  it('retains the result of a node that settles cooperatively on parent cancellation', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const started = createDeferred();
    const node = defineNode({
      name: 'cooperative',
      execute({ signal }) {
        started.resolve();
        return new Promise<{ summary: string }>((resolve) => {
          signal.addEventListener(
            'abort',
            () => resolve({ summary: 'stopped cleanly' }),
            { once: true },
          );
        });
      },
    });
    const registry = new NodeRegistry([node]);
    const execution = runCollectedCase(
      collected([step(node.name, false, 60_000)]),
      {
        resolveNode: registry.require.bind(registry),
        signal: controller.signal,
      },
    );
    await started.promise;

    controller.abort(new Error('stop requested'));
    await vi.advanceTimersByTimeAsync(0);
    const result = await execution;

    expect(result.steps[0]).toMatchObject({
      status: 'success',
      output: { summary: 'stopped cleanly' },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps StepTimeoutError when timeout aborts a cooperative node first', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const node = defineNode({
      name: 'timed-cooperative',
      execute(ctx) {
        signal = ctx.signal;
        return new Promise<{ summary: string }>((resolve) => {
          ctx.signal.addEventListener(
            'abort',
            () => resolve({ summary: 'stopped after timeout' }),
            { once: true },
          );
        });
      },
    });
    const registry = new NodeRegistry([node]);
    const execution = runCollectedCase(
      collected([step(node.name, false, 50)]),
      { resolveNode: registry.require.bind(registry) },
    );

    await vi.advanceTimersByTimeAsync(50);
    const result = await execution;

    expect(signal?.reason).toBeInstanceOf(StepTimeoutError);
    expect(result.steps[0].error).toBeInstanceOf(StepTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves parent cancellation when timeout expires in the same timer turn', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const cancellationReason = new Error('cancelled at timeout boundary');
    const node = defineNode({
      name: 'parent-cancelled-at-timeout',
      execute() {
        return new Promise<void>(() => {});
      },
    });
    const registry = new NodeRegistry([node]);
    setTimeout(() => controller.abort(cancellationReason), 50);

    const execution = runCollectedCase(
      collected([step(node.name, false, 50)]),
      {
        resolveNode: registry.require.bind(registry),
        signal: controller.signal,
      },
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(50);
    const result = await execution;

    expect(result.steps[0].error).toMatchObject({
      code: 'NODE_EXECUTION_ERROR',
      cause: cancellationReason,
    });
  });

  it('handles a late node rejection after cancellation settles the runner', async () => {
    const controller = new AbortController();
    const started = createDeferred();
    const nodeExecution = createDeferred();
    const node = defineNode({
      name: 'late-rejection',
      execute() {
        started.resolve();
        return nodeExecution.promise;
      },
    });
    const registry = new NodeRegistry([node]);
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const execution = runCollectedCase(collected([step(node.name)]), {
        resolveNode: registry.require.bind(registry),
        signal: controller.signal,
      });
      await started.promise;
      controller.abort(new Error('cancel running node'));
      await execution;

      nodeExecution.reject(new Error('late node failure'));
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection);
    }
  });

  it('does not start a node after parent cancellation interrupts input parsing', async () => {
    const controller = new AbortController();
    const cancellationReason = new Error('cancelled during input parsing');
    const execute = vi.fn();
    const parsingStarted = createDeferred();
    const validationGate = createDeferred();
    const parsingFinished = createDeferred();
    const inputSchema = z.strictObject({
      value: z.string().refine(async () => {
        parsingStarted.resolve();
        await validationGate.promise;
        return true;
      }),
    });
    const safeParseAsync = inputSchema.safeParseAsync.bind(inputSchema);
    vi.spyOn(inputSchema, 'safeParseAsync').mockImplementation(
      async (input) => {
        const parsed = await safeParseAsync(input);
        parsingFinished.resolve();
        return parsed;
      },
    );
    const node = defineNode({
      name: 'cancelled-during-parse',
      inputSchema,
      execute,
    });
    const registry = new NodeRegistry([node]);
    const execution = runCollectedCase(
      collected([
        {
          node: node.name,
          input: { value: 'valid' },
          meta: { continueOnError: false },
        },
      ]),
      {
        resolveNode: registry.require.bind(registry),
        signal: controller.signal,
      },
    );
    await parsingStarted.promise;

    controller.abort(cancellationReason);
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const observed = await Promise.race([
      execution,
      new Promise<'watchdog'>((resolve) => {
        watchdog = setTimeout(() => resolve('watchdog'), 50);
      }),
    ]);
    if (watchdog !== undefined) clearTimeout(watchdog);
    validationGate.resolve();
    await parsingFinished.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(observed).not.toBe('watchdog');
    if (observed === 'watchdog') return;
    expect(observed.steps[0].error).toMatchObject({
      code: 'NODE_EXECUTION_ERROR',
      cause: cancellationReason,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
