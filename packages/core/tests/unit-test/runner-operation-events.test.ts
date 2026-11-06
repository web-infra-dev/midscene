import { ActionReadiness } from '@/agent/action-readiness';
import type { TestRunReportOperationEvent } from '@/test-run-report';
import {
  defineNode,
  executeStep,
  observeResourceOperations,
  trackResourceOperation,
} from '@/test-runner';
import { hasPendingResourceOperation } from '@/test-runner';
import { describe, expect, it } from '@rstest/core';

describe('operation history at the Runner boundary', () => {
  it('tracks actual readiness completion after its wait has been cancelled', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((yes) => {
      resolve = yes;
    });
    const resource = {};
    const controller = new AbortController();
    const readiness = new ActionReadiness(() => pending);
    const waiting = readiness.wait(
      { id: 'task', name: 'Tap', param: {} },
      controller.signal,
      resource,
    );
    await Promise.resolve();
    controller.abort(new Error('readiness cancellation'));
    await expect(waiting).rejects.toThrow('readiness cancellation');
    expect(hasPendingResourceOperation(resource)).toBe(true);
    resolve();
    await pending;
    await Promise.resolve();
    expect(hasPendingResourceOperation(resource)).toBe(false);
  });
  it.each(['success', 'failed'] as const)(
    'retains original identity for late %s after the observer closes',
    async (status) => {
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const pending = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const events: TestRunReportOperationEvent[] = [];
      const controller = new AbortController();
      const stop = observeResourceOperations(controller.signal, (event) =>
        events.push(event),
      );
      const result = await executeStep(
        {
          node: 'action',
          input: {},
          meta: { timeoutMs: 10, continueOnError: true },
        },
        defineNode({
          name: 'action',
          execute: (ctx) => trackResourceOperation({}, pending, ctx.signal),
        }),
        {
          scope: 'case',
          case: {
            caseId: 'case',
            runId: 'attempt-1',
            projectName: 'project',
            attemptIndex: 0,
            name: 'case',
            sourcePath: '',
            caseIndex: 0,
            phase: 'steps',
            stepIndex: 0,
          },
        },
        undefined,
        { signal: controller.signal },
      );
      expect(result.status).toBe('failed');
      const returned = result.operations!.events.find(
        (event) => event.kind === 'runner-returned',
      )!;
      expect(returned).toMatchObject({
        stepId: 'attempt-1:steps:0',
        pending: true,
        status: 'failed',
      });
      const resource = events.find(
        (event) => event.operationKind === 'resource',
      )!;
      expect(
        events
          .filter((event) => event.operationId === resource.operationId)
          .map((event) => event.kind),
      ).toEqual(['started', 'cancel-requested']);
      const snapshot = JSON.stringify(result);
      stop();
      if (status === 'success') resolve();
      else reject(new Error('late failure'));
      await pending.catch(() => {});
      await Promise.resolve();
      expect(
        events.find(
          (event) =>
            event.operationId === resource.operationId &&
            event.kind === 'settled',
        ),
      ).toMatchObject({
        status,
        stepId: 'attempt-1:steps:0',
        scopeId: 'attempt-1',
      });
      expect(JSON.stringify(result)).toBe(snapshot);
    },
  );
});
