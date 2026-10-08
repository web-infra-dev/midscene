import type { TestRunReportSourceIndex } from '@/test-run-report';
import {
  type CollectedWorkflowDocument,
  buildTestRunReportDump,
  buildTestRunReportPlan,
  defineNode,
  runWorkflowDocument,
} from '@/test-runner';
import { describe, expect, test } from '@rstest/core';

const document = (): CollectedWorkflowDocument => ({
  documentId: 'document',
  projectId: 'project',
  sourcePath: 'map.yaml',
  lifecycle: {
    beforeAll: [
      {
        node: 'setup',
        input: { prompt: 'Open debugger' },
        meta: { continueOnError: false },
      },
    ],
    beforeEach: [
      {
        node: 'setup',
        input: { prompt: 'Reset map' },
        meta: { continueOnError: false },
      },
    ],
    afterEach: [],
    afterAll: [],
  },
  cases: [0, 1].map((caseIndex) => ({
    caseId: `case-${caseIndex}`,
    projectId: 'project',
    sourcePath: 'map.yaml',
    caseIndex,
    definition: {
      name: `Map ${caseIndex}`,
      tags: [caseIndex ? 'slow' : 'smoke'],
      steps: [
        {
          node: 'body',
          input: { prompt: { prompt: 'Preview map' }, apiKey: 'secret' },
          meta: { timeoutMs: 30, continueOnError: true },
        },
      ],
    },
  })),
});
const index: TestRunReportSourceIndex = {
  sources: [],
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
};

describe('independent test plan', () => {
  test('snapshots all phases and selection without retaining mutable inputs or secrets', () => {
    const original = document();
    const plan = buildTestRunReportPlan(original, {
      selectedCaseIds: ['case-0'],
      defaultTimeoutMs: 100,
      retry: { scope: 'document', count: 2 },
    });
    expect(plan.retry).toEqual({ scope: 'document', count: 2 });
    expect(plan.cases.map((item) => item.selected)).toEqual([true, false]);
    expect(plan.beforeAll[0].timeoutMs).toBe(100);
    expect(plan.cases[0].steps[0]).toMatchObject({
      title: 'Preview map',
      timeoutMs: 30,
      continueOnError: true,
      input: { value: { apiKey: '[REDACTED]' }, redactedPaths: ['$.apiKey'] },
    });
    expect(plan.cases[0].beforeEach[0].id).not.toBe(
      plan.cases[1].beforeEach[0].id,
    );
    expect(buildTestRunReportPlan(original).cases[0].steps[0].id).toBe(
      plan.cases[0].steps[0].id,
    );
    original.cases[0].definition.steps[0].input.prompt = 'changed';
    expect(plan.cases[0].steps[0].input.value).toMatchObject({
      prompt: { prompt: 'Preview map' },
    });
    expect(JSON.stringify(plan)).not.toContain('secret');
  });

  test('retains planned Case steps and links setup results when beforeAll fails without creating attempts', async () => {
    const original = document();
    const execution = await runWorkflowDocument(original, {
      retry: 3,
      resolveNode: () =>
        defineNode({
          name: 'setup',
          execute() {
            throw new Error('wrong debugger title');
          },
        }),
    });
    const dump = buildTestRunReportDump(
      {
        runId: 'run',
        status: 'failed',
        startedAt: execution.document.startedAt,
        endedAt: execution.document.endedAt,
        durationMs: execution.document.durationMs,
        summary: {
          total: 2,
          passed: 0,
          failed: 0,
          notRun: 2,
          filtered: 0,
          collectionErrors: 0,
          documentFailures: 1,
          projectFailures: 0,
        },
        projects: [
          {
            projectId: 'project',
            name: 'maps',
            status: 'failed',
            retry: 3,
            documents: [execution.document],
            collectionErrors: [],
            cases: execution.cases.map((item) => ({
              ...item,
              documentId: original.documentId,
            })),
          },
        ],
      },
      index,
    );
    const report = dump.projects[0].documents[0];
    expect(report.plan?.retry).toEqual({ scope: 'case', count: 3 });
    expect(report.beforeAll[0].planStepId).toBe(report.plan?.beforeAll[0].id);
    expect(report.cases[0]).toMatchObject({
      status: 'not-run',
      attempts: [],
      plan: { steps: [{ node: 'body', title: 'Preview map' }] },
    });
    expect(report.cases[1].attempts).toEqual([]);
  });

  test('keeps fully filtered documents in plans without inventing successful executions', () => {
    const plan = buildTestRunReportPlan(document(), { selectedCaseIds: [] });
    const dump = buildTestRunReportDump(
      {
        runId: 'run',
        status: 'success',
        startedAt: '2026-10-08T00:00:00Z',
        endedAt: '2026-10-08T00:00:00Z',
        durationMs: 0,
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          notRun: 0,
          filtered: 2,
          collectionErrors: 0,
          documentFailures: 0,
          projectFailures: 0,
        },
        projects: [
          {
            projectId: 'project',
            name: 'maps',
            status: 'success',
            retry: 0,
            documents: [],
            collectionErrors: [],
            cases: [],
            plans: [plan],
          },
        ],
      },
      index,
    );
    expect(dump.projects[0].documents).toEqual([]);
    expect(dump.projects[0].plans?.[0].cases).toHaveLength(2);
    expect(dump.summary.total).toBe(0);
  });
});
