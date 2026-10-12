import {
  NodeExecutionError,
  WorkflowError,
  cleanupResources,
  defineNode,
  getResourceCleanupCompletion,
  getResourceCleanupSnapshot,
  isFatalDeviceError,
  normalizeNodeExecutionError,
  observeResourceOperations,
  runWorkflowDocument,
  sanitizeReportError,
  trackResourceOperation,
} from '@/test-runner';
import { collectLegacyYamlDocument } from '@/yaml/test-runner-compat';
import { afterEach, describe, expect, rs, test } from '@rstest/core';

const document = () =>
  collectLegacyYamlDocument({
    tasks: [{ name: 'case', flow: [{ javascript: 'work()' }] }],
  });
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
afterEach(() => {
  rs.useRealTimers();
});

describe('structured execution diagnostics', () => {
  test('redacts labeled credentials in nested messages and bounds fatal-error traversal', () => {
    const leaf = new Error(
      'password="private value", Authorization: Bearer private-bearer, https://user:private-password@example.test',
    );
    const value = sanitizeReportError(new Error('outer', { cause: leaf }));
    expect(JSON.stringify(value)).not.toContain('private');
    expect(value.cause?.message).toContain('[REDACTED]');
    expect(sanitizeReportError(value)).toEqual(value);
    const cyclic = new Error('cyclic');
    cyclic.cause = cyclic;
    expect(isFatalDeviceError(cyclic)).toBe(false);
    expect(
      isFatalDeviceError(
        new AggregateError([new Error('device offline')], 'cleanup'),
      ),
    ).toBe(true);
  });
  test('preserves redacted causes and aggregate branches in JSON transport', () => {
    const leaf = new WorkflowError('request failed', {
      code: 'REQUEST_FAILED',
      details: { password: 'do-not-publish', attempt: 2 },
    });
    const error = new NodeExecutionError(
      'aiAssert',
      new AggregateError(
        [leaf, new Error('independent failure')],
        'two failures',
        { cause: leaf },
      ),
    );
    const value = JSON.parse(JSON.stringify(error));
    expect(value.cause.errors[0]).toMatchObject({
      code: 'REQUEST_FAILED',
      details: { value: { password: '[REDACTED]', attempt: 2 } },
    });
    expect(value.cause.errors[1].message).toBe('independent failure');
    expect(JSON.stringify(value)).not.toContain('do-not-publish');
    expect(sanitizeReportError(value)).toEqual(value);
    const thrownString = sanitizeReportError('assertion failed');
    expect(sanitizeReportError(thrownString)).toEqual(thrownString);
  });
  test('bounds cyclic and excessively large cause chains', () => {
    const cyclic = new Error('cyclic');
    cyclic.cause = cyclic;
    expect(sanitizeReportError(cyclic).cause?.truncated).toBe(true);
    const huge = new AggregateError(
      Array.from(
        { length: 50 },
        () =>
          new WorkflowError('\u0000'.repeat(3000), {
            details: {
              logs: Array.from({ length: 50 }, () => 'x'.repeat(2000)),
            },
          }),
      ),
      'huge',
    );
    const serialized = JSON.stringify(sanitizeReportError(huge));
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      64 * 1024,
    );
    expect(serialized).toContain('truncated');
  });
  test('does not wrap a WorkflowError from another module instance again', () => {
    const foreign = Object.assign(
      new Error('Node "aiAssert" failed: title did not match'),
      {
        name: 'NodeExecutionError',
        code: 'NODE_EXECUTION_ERROR',
        [Symbol.for('@midscene/core/workflow-error')]: true,
      },
    );
    expect(normalizeNodeExecutionError(foreign, 'aiAssert')).toBe(foreign);
  });
  test('records retry and budget exhaustion at each actual attempt', async () => {
    const result = await runWorkflowDocument(document(), {
      retry: 1,
      resolveNode: () =>
        defineNode({
          name: 'javascript',
          execute() {
            throw new Error('assertion failed');
          },
        }),
    });
    expect(result.cases[0].attempts?.map((run) => run.retryDecision)).toEqual([
      {
        scope: 'case',
        retryCount: 1,
        attemptIndex: 0,
        decision: 'retry',
        reason: 'attempt-failed',
      },
      {
        scope: 'case',
        retryCount: 1,
        attemptIndex: 1,
        decision: 'stop',
        reason: 'budget-exhausted',
      },
    ]);
  });
  test('reports successful actions separately from failed disposal and stops retrying', async () => {
    const result = await runWorkflowDocument(document(), {
      retry: 3,
      resolveNode: () =>
        defineNode({
          name: 'javascript',
          execute(ctx) {
            ctx.onTeardown(() => {
              throw new Error('device release failed');
            });
          },
        }),
    });
    expect(result.cases[0].attempts).toHaveLength(1);
    expect(result.cases[0].run).toMatchObject({
      status: 'failed',
      executionStatus: 'success',
      cleanup: { status: 'failed' },
      retryDecision: { reason: 'cleanup-failed', retryCount: 3 },
    });
    expect(
      result.cases[0].run?.cleanup?.error?.errors?.[0].cause?.message,
    ).toBe('device release failed');
  });
  test('observes callback interruption before admitting another attempt', async () => {
    const controller = new AbortController();
    const result = await runWorkflowDocument(document(), {
      retry: 3,
      signal: controller.signal,
      resolveNode: () =>
        defineNode({
          name: 'javascript',
          execute() {
            throw new Error('assertion failed');
          },
        }),
      onCaseResult() {
        controller.abort(new Error('stop'));
      },
    });
    expect(result.cases[0].attempts).toHaveLength(1);
    expect(result.cases[0].run?.retryDecision).toMatchObject({
      decision: 'stop',
      reason: 'interrupted',
    });
  });
  test('keeps cleanup pending in the snapshot while late settlement is queryable and journaled', async () => {
    rs.useFakeTimers();
    const action = gate();
    const controller = new AbortController();
    const events: any[] = [];
    const unsubscribe = observeResourceOperations(controller.signal, (event) =>
      events.push(event),
    );
    const resultPromise = runWorkflowDocument(document(), {
      signal: controller.signal,
      retry: 3,
      defaultTimeoutMs: 10,
      createCaseRunId: () => 'case-run',
      resolveNode: () =>
        defineNode({
          name: 'javascript',
          execute(ctx) {
            ctx.onTeardown(() => {
              throw new Error('late disposal failure');
            });
            return trackResourceOperation({}, action.promise, ctx.signal);
          },
        }),
    });
    await rs.advanceTimersByTimeAsync(1100);
    const result = await resultPromise;
    const attempt = result.cases[0].run!;
    expect(attempt.cleanup).toMatchObject({
      status: 'pending',
      blockingOperations: expect.arrayContaining([
        expect.objectContaining({ stepId: 'case-run:steps:0' }),
      ]),
    });
    expect(attempt.teardownErrors).toBeUndefined();
    expect(attempt.retryDecision?.reason).toBe('cleanup-pending');
    expect(events.some((event) => event.kind === 'cleanup-deferred')).toBe(
      true,
    );
    const snapshot = JSON.stringify(result);
    unsubscribe();
    action.resolve();
    const cleanupEvent = events.find(
      (event) =>
        event.operationKind === 'cleanup' && event.scopeId === 'case-run',
    );
    await rs.waitFor(() =>
      expect(
        events.some(
          (event) =>
            event.operationId === cleanupEvent.operationId &&
            event.kind === 'settled' &&
            event.status === 'failed',
        ),
      ).toBe(true),
    );
    expect(JSON.stringify(result)).toBe(snapshot);
  });
  test('exposes the eventual disposal failure without changing the cleanup snapshot', async () => {
    const action = gate();
    const resource = {};
    const controller = new AbortController();
    trackResourceOperation(resource, action.promise, controller.signal);
    await cleanupResources(
      [resource],
      async () => {
        throw new Error('late release failed');
      },
      { graceMs: 5, onDeferredError() {} },
    ).catch(() => {});
    const snapshot = getResourceCleanupSnapshot(resource);
    expect(snapshot.status).toBe('pending');
    action.resolve();
    await expect(getResourceCleanupCompletion(resource)).rejects.toThrow(
      'late release failed',
    );
    expect(getResourceCleanupSnapshot(resource)).toMatchObject({
      status: 'failed',
      error: { message: 'late release failed' },
    });
    expect(snapshot.status).toBe('pending');
  });
  test('stops retries when an operation is pending even without a disposer', async () => {
    rs.useFakeTimers();
    const action = gate();
    const resultPromise = runWorkflowDocument(document(), {
      retry: 3,
      defaultTimeoutMs: 10,
      resolveNode: () =>
        defineNode({
          name: 'javascript',
          execute() {
            return action.promise;
          },
        }),
    });
    await rs.advanceTimersByTimeAsync(20);
    const result = await resultPromise;
    expect(result.cases[0].attempts).toHaveLength(1);
    expect(result.cases[0].run).toMatchObject({
      cleanup: { status: 'not-required' },
      retryDecision: { reason: 'operation-pending' },
    });
    action.resolve();
  });
});
