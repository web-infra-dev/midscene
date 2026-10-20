import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowError, defineNode } from '@midscene/core/internal/test-runner';
import type {
  CollectedWorkflowDocument,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeDocumentInvocation,
  isSharedResourceFailure,
} from '../src/cli/document-invocation';
import type { PreparedDocumentInvocation } from '../src/cli/execution-plan';
import type { TestReporterEvent } from '../src/cli/reporter-events';
import * as resultStore from '../src/cli/result-store';
import type { TestProjectCaseRunResult } from '../src/cli/types';
import { NodeRegistry } from '../src/engine/registry';

afterEach(() => vi.restoreAllMocks());

const collectedDocument = (name: string): CollectedWorkflowDocument => ({
  projectId: 'project',
  documentId: 'document',
  sourcePath: 'cases/example.yaml',
  lifecycle: { beforeAll: [], beforeEach: [], afterEach: [], afterAll: [] },
  cases: [
    {
      projectId: 'project',
      caseId: 'case',
      caseIndex: 0,
      sourcePath: 'cases/example.yaml',
      definition: {
        name,
        steps: [
          { node: 'javascript', input: {}, meta: { continueOnError: false } },
        ],
      },
    },
  ],
});

const invocationOptions = (runDir: string, retry = 3) => {
  const signal = new AbortController().signal;
  return {
    runDir,
    sinks: {
      cases: [] as TestProjectCaseRunResult[],
      documents: [] as WorkflowDocumentRunResult[],
    },
    signal,
    rootSignal: signal,
    projectContext: undefined,
    project: {
      projectId: 'project',
      name: 'test',
      retry,
      tags: { include: [], exclude: [] },
      variables: {},
      nodes: new NodeRegistry(),
    },
    shouldBail: () => false,
    isProjectFatal: () => false,
    markProjectFatal() {},
    addFailedCases() {},
    onProgress() {},
  };
};

describe('resource failure policy', () => {
  it.each([
    { policy: true, notification: false },
    { policy: true, notification: true },
    { policy: false, notification: true },
  ])(
    'classifies independently of notifications: %j',
    async ({ policy, notification }) => {
      const runDir = mkdtempSync(join(tmpdir(), 'midscene-failure-policy-'));
      try {
        const markProjectFatal = vi.fn();
        const onUnresolvedResources = vi.fn();
        await executeDocumentInvocation({
          ...invocationOptions(runDir, 0),
          isolatedContext: true,
          markProjectFatal,
          ...(policy
            ? { isProjectResourceFailure: isSharedResourceFailure }
            : {}),
          ...(notification ? { onUnresolvedResources } : {}),
          invocation: {
            document: collectedDocument('shared resource failure'),
            retry: { scope: 'case', count: 0 },
            reportEnabled: false,
            bindings: {
              resolveNode: () =>
                defineNode({
                  name: 'javascript',
                  execute() {
                    throw new WorkflowError('Shared resource failed', {
                      code: 'PROJECT_RESOURCE_ERROR',
                    });
                  },
                }),
            },
          },
        });
        expect(markProjectFatal.mock.calls.length > 0).toBe(policy);
        expect(onUnresolvedResources).not.toHaveBeenCalled();
      } finally {
        rmSync(runDir, { recursive: true, force: true });
      }
    },
  );

  it('recognizes explicit ownership through aggregate errors and cyclic causes', () => {
    const error = new Error('wrapper');
    error.cause = error;
    expect(isSharedResourceFailure(error)).toBe(false);
    expect(
      isSharedResourceFailure(
        new AggregateError([
          error,
          new WorkflowError('shared failure', {
            code: 'PROJECT_RESOURCE_ERROR',
          }),
        ]),
      ),
    ).toBe(true);
  });
});

describe('persisted retry decisions', () => {
  it('publishes final Case progress only after whole-document retries settle', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-document-progress-'));
    try {
      const events: TestReporterEvent[] = [];
      let calls = 0;
      await executeDocumentInvocation({
        ...invocationOptions(runDir, 1),
        onEvent: (event) => events.push(event),
        invocation: {
          document: collectedDocument('recovered document'),
          retry: { scope: 'document', count: 1 },
          reportEnabled: false,
          bindings: {
            resolveNode: () =>
              defineNode({
                name: 'javascript',
                execute() {
                  calls++;
                  if (calls === 1) throw new Error('retry document');
                },
              }),
          },
        },
      });
      expect(calls).toBe(2);
      expect(events.filter((event) => event.type === 'step-end')).toEqual([
        expect.objectContaining({
          result: expect.objectContaining({ status: 'failed' }),
        }),
        expect.objectContaining({
          result: expect.objectContaining({ status: 'success' }),
        }),
      ]);
      expect(
        events.filter((event) => event.type === 'document-start'),
      ).toHaveLength(1);
      expect(events.filter((event) => event.type === 'document-end')).toEqual([
        expect.objectContaining({
          document: expect.objectContaining({
            status: 'success',
            attemptIndex: 1,
          }),
          cases: [expect.objectContaining({ status: 'success' })],
        }),
      ]);
      expect(events.at(-1)?.type).toBe('document-end');

      expect(events.filter((event) => event.type === 'case-end')).toEqual([
        expect.objectContaining({
          outcome: expect.objectContaining({ status: 'success' }),
          documentRetries: 1,
        }),
      ]);
      expect(
        events.filter((event) => event.type === 'document-retry'),
      ).toHaveLength(1);
      expect(
        events.filter((event) => event.type === 'case-attempt-end'),
      ).toHaveLength(0);
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
  it('records host disposal failure and stops the owning Project without rejecting the run', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-retry-disposal-'));
    try {
      const document = collectedDocument('successful case');
      const options = invocationOptions(runDir);
      const markProjectFatal = vi.fn();
      const { sinks } = options;
      let calls = 0;
      await expect(
        executeDocumentInvocation({
          invocation: {
            document,
            retry: { scope: 'document', count: 3 },
            reportEnabled: false,
            bindings: {
              resolveNode: () =>
                defineNode({
                  name: 'javascript',
                  execute() {
                    calls++;
                  },
                }),
              documentSetup: {
                name: 'owner',
                setup(ctx) {
                  ctx.onTeardown(() => {
                    throw new Error('close failed');
                  });
                },
              },
            },
          },
          ...options,
          markProjectFatal,
        }),
      ).resolves.toBeUndefined();
      expect(calls).toBe(1);
      expect(markProjectFatal).toHaveBeenCalledOnce();
      expect(sinks.documents).toHaveLength(1);
      expect(sinks.cases).toHaveLength(1);
      expect(sinks.documents[0]).toMatchObject({
        status: 'failed',
        executionStatus: 'success',
        cleanup: { status: 'failed' },
        retryDecision: { decision: 'stop', reason: 'cleanup-failed' },
        hostErrors: [
          {
            phase: 'cleanup',
            error: expect.objectContaining({ message: 'close failed' }),
          },
        ],
      });
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
  it.each(['case', 'document'] as const)(
    'keeps %s Node cleanup failures local to the Project and does not retry',
    async (scope) => {
      const runDir = mkdtempSync(join(tmpdir(), 'midscene-node-disposal-'));
      try {
        const document = collectedDocument('cleanup failure');
        if (scope === 'document')
          document.lifecycle.beforeAll = document.cases[0].definition.steps;
        const options = invocationOptions(runDir);
        const markProjectFatal = vi.fn();
        let calls = 0;
        await executeDocumentInvocation({
          ...options,
          markProjectFatal,
          invocation: {
            document,
            retry: { scope, count: 3 },
            reportEnabled: false,
            bindings: {
              resolveNode: () =>
                defineNode({
                  name: 'javascript',
                  execute({ onTeardown }) {
                    calls++;
                    if (scope === 'case' || calls === 1)
                      onTeardown(() => {
                        throw new Error('resource close failed');
                      });
                  },
                }),
            },
          },
        });
        expect(calls).toBe(scope === 'case' ? 1 : 2);
        expect(markProjectFatal).toHaveBeenCalledOnce();
        expect(options.sinks.documents).toHaveLength(1);
        const owner =
          scope === 'case'
            ? options.sinks.cases[0].run!
            : options.sinks.documents[0];
        expect(owner).toMatchObject({
          cleanup: { status: 'failed' },
          retryDecision: { decision: 'stop', reason: 'cleanup-failed' },
          teardownErrors: [
            expect.objectContaining({ code: 'NODE_SCOPE_TEARDOWN_ERROR' }),
          ],
        });
      } finally {
        rmSync(runDir, { recursive: true, force: true });
      }
    },
  );
  it('retains successful actions and stops retries when final publication fails', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-retry-publication-'));
    const publicationError = new Error('result disk unavailable');
    vi.spyOn(resultStore, 'writeWorkflowDocumentResult').mockRejectedValue(
      publicationError,
    );
    try {
      const document = collectedDocument('successful case');
      const options = invocationOptions(runDir);
      const { sinks } = options;
      let calls = 0;
      await expect(
        executeDocumentInvocation({
          invocation: {
            document,
            retry: { scope: 'document', count: 3 },
            reportEnabled: false,
            bindings: {
              resolveNode: () =>
                defineNode({
                  name: 'javascript',
                  execute() {
                    calls++;
                  },
                }),
            },
          },
          ...options,
        }),
      ).rejects.toMatchObject({ errors: [publicationError] });
      expect(calls).toBe(1);
      expect(sinks.documents[0]).toMatchObject({
        status: 'failed',
        executionStatus: 'success',
        hostErrors: [{ phase: 'publication', error: publicationError }],
        retryDecision: { decision: 'stop', reason: 'infrastructure-error' },
      });
      expect(sinks.cases[0].run?.steps[0].status).toBe('success');
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
  it.each(['case', 'document'] as const)(
    'persists %s retry history before sealing summary facts',
    async (scope) => {
      const runDir = mkdtempSync(join(tmpdir(), 'midscene-retry-decisions-'));
      try {
        const document = collectedDocument('retry case');
        const invocation: PreparedDocumentInvocation = {
          document,
          retry: { scope, count: 1 },
          reportEnabled: false,
          bindings: {
            resolveNode: () =>
              defineNode({
                name: 'javascript',
                execute() {
                  throw new Error('business assertion failed');
                },
              }),
          },
        };
        const options = invocationOptions(runDir, 1);
        const { sinks } = options;
        await executeDocumentInvocation({
          invocation,
          ...options,
        });
        const decisions =
          scope === 'document'
            ? sinks.documents.map((item) => item.retryDecision)
            : sinks.cases[0].attempts!.map((item) => item.retryDecision);
        expect(decisions.map((item) => item?.reason)).toEqual([
          'attempt-failed',
          'budget-exhausted',
        ]);
        if (scope === 'document')
          for (const item of sinks.documents) {
            const saved = JSON.parse(
              readFileSync(
                join(
                  runDir,
                  item.projectId,
                  'documents',
                  item.documentId,
                  `${item.documentRunId}.json`,
                ),
                'utf8',
              ),
            );
            expect(saved.retryDecision).toEqual(item.retryDecision);
          }
        else
          for (const item of sinks.cases[0].attempts!) {
            const saved = JSON.parse(
              readFileSync(
                join(
                  runDir,
                  document.projectId,
                  'documents',
                  document.documentId,
                  'cases',
                  item.caseId,
                  `${item.runId}.json`,
                ),
                'utf8',
              ),
            );
            expect(saved.retryDecision).toEqual(item.retryDecision);
            expect(saved.steps[0].error.cause.message).toBe(
              'business assertion failed',
            );
          }
      } finally {
        rmSync(runDir, { recursive: true, force: true });
      }
    },
  );
  it('does not replay a document when a node is still running without a disposer', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-retry-pending-'));
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    try {
      const document = collectedDocument('pending case');
      const options = invocationOptions(runDir);
      const { sinks } = options;
      const markProjectFatal = vi.fn();
      let calls = 0;
      await executeDocumentInvocation({
        invocation: {
          document,
          retry: { scope: 'document', count: 3 },
          reportEnabled: false,
          defaultTimeoutMs: 10,
          bindings: {
            resolveNode: () =>
              defineNode({
                name: 'javascript',
                execute() {
                  calls++;
                  return pending;
                },
              }),
          },
        },
        ...options,
        markProjectFatal,
      });
      expect(calls).toBe(1);
      expect(sinks.documents).toHaveLength(1);
      expect(markProjectFatal).toHaveBeenCalledOnce();
      expect(sinks.documents[0].retryDecision).toMatchObject({
        decision: 'stop',
        reason: 'operation-pending',
        retryCount: 3,
      });
    } finally {
      finish();
      await pending;
      rmSync(runDir, { recursive: true, force: true });
    }
  });
});
