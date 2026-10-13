import { describe, expect, it, vi } from 'vitest';
import {
  type TestCaseTask,
  TestExecutorError,
  assertTestCaseTaskRunResult,
  isTestExecutorError,
} from '../src/cli/test-executor';

const task: TestCaseTask = {
  taskId: 'project:case-1',
  projectId: 'project',
  projectName: 'web',
  documentId: 'document-case-0',
  sourcePath: 'cases/example.yaml',
  caseId: 'case-1',
  caseName: 'example',
  caseIndex: 0,
  tags: [],
  resources: [],
  retry: 0,
};

const validResult = () => ({
  case: {
    documentId: task.documentId,
    caseId: task.caseId,
    projectName: task.projectName,
    name: task.caseName,
    sourcePath: task.sourcePath,
    caseIndex: task.caseIndex,
    status: 'not-run' as const,
    notRunReason: 'executor-failed' as const,
  },
});

describe('test executor result validation', () => {
  it('recognizes executor errors from another module copy without accepting lookalikes', async () => {
    vi.resetModules();
    const other = await import('../src/cli/test-executor');
    const error = new other.TestExecutorError('capacity', {
      kind: 'provision',
      retryable: true,
    });
    expect(error).not.toBeInstanceOf(TestExecutorError);
    expect(isTestExecutorError(error)).toBe(true);
    expect(
      isTestExecutorError(
        Object.assign(new Error('fake'), {
          name: 'TestExecutorError',
          kind: 'transport',
          retryable: true,
        }),
      ),
    ).toBe(false);
    expect(
      isTestExecutorError({
        name: 'TestExecutorError',
        kind: 'transport',
        retryable: true,
      }),
    ).toBe(false);
  });
  it.each([
    { cleanup: { status: 'pending', capturedAt: '2026-10-13T00:00:00Z' } },
    { cleanup: { status: 'failed', capturedAt: '2026-10-13T00:00:00Z' } },
    { pendingOperations: [{ operationId: 'still-running' }] },
  ])('rejects successful lifecycle with unfinished work: %j', (diagnostics) => {
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        lifecycle: {
          projectName: task.projectName,
          status: 'success',
          startedAt: '2026-10-13T00:00:00Z',
          endedAt: '2026-10-13T00:00:01Z',
          durationMs: 1000,
          ...diagnostics,
        },
      }),
    ).toThrow('inconsistent successful lifecycle');
  });

  it('retains deferred cleanup diagnostics in a failed lifecycle', () => {
    const result = {
      ...validResult(),
      lifecycle: {
        projectName: task.projectName,
        status: 'failed',
        startedAt: '2026-10-13T00:00:00Z',
        endedAt: '2026-10-13T00:00:01Z',
        durationMs: 1000,
        cleanup: {
          status: 'pending',
          capturedAt: '2026-10-13T00:00:01Z',
          blockingOperations: [{ operationId: 'cleanup-1' }],
        },
        pendingOperations: [{ operationId: 'cleanup-1' }],
      },
    };
    expect(() => assertTestCaseTaskRunResult(task, result)).not.toThrow();
    expect(result.lifecycle.pendingOperations).toEqual([
      { operationId: 'cleanup-1' },
    ]);
  });

  it.each(['error', 'continuedAfterError'])(
    'rejects successful step with %s',
    (field) => {
      const timing = {
        startedAt: '2026-09-17T00:00:00Z',
        endedAt: '2026-09-17T00:00:01Z',
        durationMs: 1000,
      };
      const step = {
        phase: 'steps',
        stepIndex: 0,
        node: 'test',
        input: {},
        meta: { continueOnError: true },
        status: 'success',
        continuedAfterError: false,
        ...timing,
        [field]:
          field === 'error'
            ? { name: 'Error', code: 'ASSERT', message: 'failed' }
            : true,
      };
      const attempt = {
        caseId: task.caseId,
        runId: 'attempt-1',
        projectName: task.projectName,
        attemptIndex: 0,
        name: task.caseName,
        sourcePath: task.sourcePath,
        caseIndex: 0,
        status: 'success',
        beforeEach: [],
        steps: [step],
        afterEach: [],
        ...timing,
      };
      expect(() =>
        assertTestCaseTaskRunResult(task, {
          case: {
            ...validResult().case,
            status: 'success',
            notRunReason: undefined,
            run: attempt,
            attempts: [attempt],
          },
        }),
      ).toThrow('invalid transport data');
    },
  );

  it('rejects successful attempts containing failed steps, even when execution continued', () => {
    const timing = {
      startedAt: '2026-09-17T00:00:00Z',
      endedAt: '2026-09-17T00:00:01Z',
      durationMs: 1000,
    };
    const attempt = {
      caseId: task.caseId,
      runId: 'attempt-1',
      projectName: task.projectName,
      attemptIndex: 0,
      name: task.caseName,
      sourcePath: task.sourcePath,
      caseIndex: 0,
      status: 'success',
      beforeEach: [],
      afterEach: [],
      ...timing,
      steps: [
        {
          phase: 'steps',
          stepIndex: 0,
          node: 'fail',
          input: {},
          meta: { continueOnError: true },
          status: 'failed',
          continuedAfterError: true,
          ...timing,
        },
      ],
    };
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        case: {
          ...validResult().case,
          status: 'success',
          notRunReason: undefined,
          run: attempt,
          attempts: [attempt],
        },
      }),
    ).toThrow('inconsistent successful attempt');
  });

  it('rejects successful lifecycle records with cleanup errors', () => {
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        lifecycle: {
          projectName: task.projectName,
          status: 'success',
          startedAt: '2026-09-17T00:00:00Z',
          endedAt: '2026-09-17T00:00:01Z',
          durationMs: 1000,
          teardownErrors: [
            { name: 'Error', message: 'cleanup failed', code: 'CLEANUP' },
          ],
        },
      }),
    ).toThrow('inconsistent successful lifecycle');
  });

  it('accepts a result that matches its task', () => {
    expect(() =>
      assertTestCaseTaskRunResult(task, validResult()),
    ).not.toThrow();
  });

  it('rejects malformed transport data before it reaches result storage', () => {
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        case: { ...validResult().case, status: 'maybe' },
      }),
    ).toThrow('invalid transport data');
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        artifacts: [{ name: 'report', uri: 42 }],
      }),
    ).toThrow('invalid transport data');
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        metadata: { worker: { nested: true } },
      }),
    ).toThrow('invalid transport data');
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        case: {
          ...validResult().case,
          attempts: [
            {
              ...validResult().case,
              status: 'failed',
              runId: '../escape',
            },
          ],
        },
      }),
    ).toThrow('invalid transport data');
  });

  it('rejects success without a completed final attempt', () => {
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        case: {
          ...validResult().case,
          status: 'success',
          notRunReason: undefined,
          attempts: [],
        },
      }),
    ).toThrow('inconsistent success result');
  });

  it('rejects local report paths from transport data', () => {
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        case: {
          ...validResult().case,
          status: 'success',
          notRunReason: undefined,
          run: {
            caseId: task.caseId,
            runId: 'attempt-1',
            projectName: task.projectName,
            attemptIndex: 0,
            name: task.caseName,
            sourcePath: task.sourcePath,
            caseIndex: task.caseIndex,
            status: 'success',
            beforeEach: [],
            steps: [],
            afterEach: [],
            startedAt: '2026-09-17T00:00:00.000Z',
            endedAt: '2026-09-17T00:00:01.000Z',
            durationMs: 1_000,
            reportPaths: ['/etc/passwd'],
          },
          attempts: [],
        },
      }),
    ).toThrow('invalid transport data');
  });
});
