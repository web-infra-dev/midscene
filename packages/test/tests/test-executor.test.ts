import { describe, expect, it } from 'vitest';
import {
  type TestCaseTask,
  assertTestCaseTaskRunResult,
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
