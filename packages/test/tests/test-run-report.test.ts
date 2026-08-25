import type { TestRunReportSourceIndex } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import type { TestProjectRunResult } from '../src/cli/types';
import type { StepRunResult } from '../src/engine/types';
import {
  buildTestRunReportDump,
  sanitizeReportError,
  sanitizeReportValue,
} from '../src/report';

const step = (executionId = 'execution-1'): StepRunResult => ({
  phase: 'steps',
  stepIndex: 0,
  node: 'aiAct',
  input: {
    prompt: 'Submit order',
    api_key: 'secret-key',
  },
  meta: { continueOnError: false },
  status: 'success',
  continuedAfterError: false,
  startedAt: '2026-08-20T00:00:00.000Z',
  endedAt: '2026-08-20T00:00:01.000Z',
  durationMs: 1_000,
  output: { summary: 'done', data: { accessToken: 'secret-token' } },
  report: {
    traces: [{ type: 'midscene-execution', executionId }],
  },
});

const result = (attemptSteps: StepRunResult[]): TestProjectRunResult => ({
  schemaVersion: 3,
  runId: 'run-1',
  startedAt: '2026-08-20T00:00:00.000Z',
  endedAt: '2026-08-20T00:00:01.000Z',
  durationMs: 1_000,
  status: 'success',
  exitCode: 0,
  resultDir: '/tmp/results',
  summaryPath: '/tmp/results/summary.json',
  reportDir: '/tmp/reports',
  summary: {
    total: 1,
    passed: 1,
    failed: 0,
    notRun: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  },
  projects: [
    {
      projectId: 'project-1',
      name: 'web',
      platform: 'web',
      status: 'success',
      retry: 0,
      fileSelection: { include: ['**/*.yaml'] },
      tagSelection: { include: [], exclude: [] },
      sourceCount: 1,
      selectedCaseCount: 1,
      filteredCaseCount: 0,
      lifecycle: undefined,
      collectionErrors: [],
      documents: [
        {
          documentId: 'document-1',
          documentRunId: 'document-run-1',
          projectId: 'project-1',
          projectName: 'web',
          sourcePath: 'case.yaml',
          status: 'success',
          startedAt: '2026-08-20T00:00:00.000Z',
          endedAt: '2026-08-20T00:00:01.000Z',
          durationMs: 1_000,
          beforeAll: [],
          afterAll: [],
        },
      ],
      cases: [
        {
          documentId: 'document-1',
          caseId: 'case-1',
          projectName: 'web',
          name: 'submit',
          sourcePath: 'case.yaml',
          caseIndex: 0,
          status: 'success',
          attempts: [
            {
              caseId: 'case-1',
              runId: 'attempt-1',
              projectName: 'web',
              attemptIndex: 0,
              name: 'submit',
              sourcePath: 'case.yaml',
              caseIndex: 0,
              status: 'success',
              beforeEach: [],
              steps: attemptSteps,
              afterEach: [],
              startedAt: '2026-08-20T00:00:00.000Z',
              endedAt: '2026-08-20T00:00:01.000Z',
              durationMs: 1_000,
            },
          ],
        },
      ],
    },
  ],
  cases: [],
  documents: [],
  collectionErrors: [],
});

const index: TestRunReportSourceIndex = {
  sources: [
    {
      reportId: 'report-1',
      scopeId: 'attempt-1',
      sourcePath: '/tmp/agent.html',
      executionIds: ['execution-1'],
    },
  ],
  metrics: {
    modelCallCount: 1,
    modelTimeMs: 500,
    promptTokens: 10,
    cachedInputTokens: 2,
    completionTokens: 3,
    totalTokens: 13,
  },
};

describe('Test Runner report manifest', () => {
  it('redacts and truncates arbitrary display data', () => {
    const cyclic: Record<string, unknown> = {
      password: 'password',
      refresh_token: 'token',
      long: 'x'.repeat(2_100),
      values: Array.from({ length: 60 }, (_, item) => item),
      fn: () => undefined,
    };
    cyclic.self = cyclic;

    const sanitized = sanitizeReportValue(cyclic);
    expect(sanitized.value).toMatchObject({
      password: '[REDACTED]',
      refresh_token: '[REDACTED]',
      self: '[Unsupported circular value]',
    });
    expect(sanitized.redactedPaths).toEqual(['$.password', '$.refresh_token']);
    expect(sanitized.truncatedPaths).toEqual(
      expect.arrayContaining(['$.long', '$.values', '$.fn', '$.self']),
    );
  });

  it('serializes errors without stack traces', () => {
    const error = Object.assign(new Error('failed'), {
      code: 'FAILED',
      details: { authorization: 'Bearer secret' },
    });
    expect(sanitizeReportError(error)).toEqual({
      name: 'Error',
      message: 'failed',
      code: 'FAILED',
      details: {
        value: { authorization: '[REDACTED]' },
        redactedPaths: ['$.authorization'],
      },
    });
  });

  it('maps a Step trace to exactly one Agent report and keeps safe values', () => {
    const manifest = buildTestRunReportDump(result([step()]), index);
    const reportStep =
      manifest.projects[0].documents[0].cases[0].attempts[0].steps[0];
    expect(reportStep.agentDetails).toEqual([
      { reportId: 'report-1', executionId: 'execution-1' },
    ]);
    expect(reportStep.input?.value).toMatchObject({ api_key: '[REDACTED]' });
    expect(reportStep.output?.data?.value).toEqual({
      accessToken: '[REDACTED]',
    });
    expect(manifest.metrics.modelTimeMs).toBe(500);
  });

  it('does not guess when a trace cannot be resolved', () => {
    const manifest = buildTestRunReportDump(result([step('missing')]), index);
    const reportStep =
      manifest.projects[0].documents[0].cases[0].attempts[0].steps[0];
    expect(reportStep.agentDetails).toBeUndefined();
    expect(reportStep.agentDetailDiagnostic).toContain('could not be resolved');
    expect(manifest.diagnostics?.[0]).toMatchObject({
      code: 'agent-detail-unresolved',
      scopeId: 'attempt-1',
      executionId: 'missing',
    });
  });
});
