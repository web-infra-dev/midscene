import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineNode } from '@midscene/core/internal/test-runner';
import type {
  CollectedWorkflowDocument,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeDocumentInvocation } from '../src/cli/document-invocation';
import type { PreparedDocumentInvocation } from '../src/cli/execution-plan';
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

describe('persisted retry decisions', () => {
  it('records cleanup failure as the stop reason while still rejecting host disposal errors', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-retry-disposal-'));
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
        }),
      ).rejects.toThrow('close failed');
      expect(calls).toBe(1);
      expect(sinks.documents[0]).toMatchObject({
        status: 'failed',
        executionStatus: 'success',
        cleanup: { status: 'failed' },
        retryDecision: { decision: 'stop', reason: 'cleanup-failed' },
      });
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
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
      });
      expect(calls).toBe(1);
      expect(sinks.documents).toHaveLength(1);
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
