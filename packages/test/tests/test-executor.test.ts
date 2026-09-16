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
    ).toThrow('invalid case status');
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        artifacts: [{ name: 'report', uri: 42 }],
      }),
    ).toThrow('invalid artifacts');
    expect(() =>
      assertTestCaseTaskRunResult(task, {
        ...validResult(),
        metadata: { worker: { nested: true } },
      }),
    ).toThrow('invalid metadata');
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
    ).toThrow('invalid case attempts');
  });
});
