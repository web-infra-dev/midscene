import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractAllDumpScriptsSync,
  extractTestRunReportDumpSync,
  generateDumpScriptTag,
  generateTestRunReportScriptTag,
} from '@/dump/html-utils';
import { ReportMergingTool } from '@/report';
import { mergeReportFiles } from '@/report-cli';
import type {
  TestRunReportDump,
  TestRunReportError,
  TestRunReportStep,
} from '@/test-run-report';
import { mergeTestRunReportDumps } from '@/test-runner/reporting/merge-report';
import { sumTestRunReportMetrics } from '@/test-runner/reporting/metrics';
import { type AIUsageInfo, ExecutionDump, ReportActionDump } from '@/types';
import { getVersion } from '@/utils';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'runner-report-merge-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const time = '2026-09-10T00:00:00.000Z';
const step = (id: string, reportId: string): TestRunReportStep => ({
  id,
  phase: 'steps',
  stepIndex: 0,
  node: 'aiAct',
  title: 'Submit',
  status: 'success',
  continuedAfterError: false,
  startedAt: time,
  endedAt: time,
  durationMs: 0,
  agentDetails: [{ reportId, executionId: 'shared-execution' }],
});

function runnerDump(reportId: string): TestRunReportDump {
  const lifecycle = {
    documentId: 'document',
    sourcePath: '/fixtures/case.yaml',
    status: 'success' as const,
    beforeAll: [{ ...step('setup', reportId), phase: 'beforeAll' as const }],
    afterAll: [],
    scopeReportIds: [reportId],
  };
  return {
    schemaVersion: 1,
    kind: 'test-runner',
    runId: 'run',
    status: 'success',
    startedAt: time,
    endedAt: time,
    durationMs: 0,
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
    metrics: {
      modelCallCount: 7,
      modelTimeMs: 100,
      promptTokens: 99,
      cachedInputTokens: 0,
      completionTokens: 1,
      totalTokens: 100,
    },
    projects: [
      {
        projectId: 'project',
        name: 'web',
        platform: 'web',
        status: 'success',
        retry: 1,
        collectionErrors: [],
        documents: [
          {
            ...lifecycle,
            logicalDocumentId: 'document',
            documentRunId: 'file-attempt-2',
            attemptIndex: 1,
            attempts: [
              {
                ...lifecycle,
                documentRunId: 'file-attempt-1',
                attemptIndex: 0,
                status: 'failed',
                teardownErrors: [
                  { name: 'Error', message: 'old cleanup failed' },
                ],
              },
              {
                ...lifecycle,
                documentRunId: 'file-attempt-2',
                attemptIndex: 1,
              },
            ],
            cases: [
              {
                caseId: 'case',
                name: 'submit',
                caseIndex: 0,
                status: 'success',
                attempts: [0, 1].map((attemptIndex) => ({
                  attemptId: `attempt-${attemptIndex}`,
                  attemptIndex,
                  status: attemptIndex ? 'success' : 'failed',
                  startedAt: time,
                  endedAt: time,
                  durationMs: 0,
                  beforeEach: [],
                  afterEach: [],
                  steps: [step(`step-${attemptIndex}`, reportId)],
                  scopeReportIds: [reportId],
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

test('namespaces framework error links across merged scopes without rewriting business data', () => {
  const recovery: TestRunReportError = {
    name: 'WorkflowError',
    code: 'RESOURCE_RECOVERY_TIMEOUT',
    message: 'Recovery timed out',
    details: {
      value: {
        blockedByStepId: 'step-0',
        blockingOperations: [
          { operationId: 'operation', stepId: 'step-0', scopeId: 'attempt-0' },
        ],
        payload: { stepId: 'business-step' },
      },
      truncatedPaths: ['$.payload'],
    },
    cause: {
      name: 'StepTimeoutError',
      code: 'STEP_TIMEOUT',
      message: 'Original timeout',
    },
  };
  const aggregate: TestRunReportError = {
    name: 'AggregateError',
    message: 'Cleanup failed',
    cause: recovery,
    errors: [
      {
        name: 'NodeScopeTeardownError',
        code: 'NODE_SCOPE_TEARDOWN_ERROR',
        message: 'Node cleanup failed',
        details: { value: { scopeId: 'attempt-0' } },
      },
    ],
  };
  const sources = ['alpha', 'beta'].map((reportId) => {
    const dump = runnerDump(reportId);
    const project = dump.projects[0];
    const document = project.documents[0];
    const attempt = document.cases[0].attempts[0];
    attempt.hostErrors = [{ phase: 'execution', error: recovery }];
    attempt.teardownErrors = [aggregate];
    attempt.cleanup = { status: 'pending', capturedAt: time, error: aggregate };
    attempt.steps[0].error = recovery;
    attempt.steps[0].evidenceCollection = {
      status: 'partial',
      errors: [aggregate],
    };
    attempt.steps[0].operations = {
      capturedAt: time,
      events: [
        {
          operationId: 'operation',
          operationKind: 'node',
          kind: 'settled',
          at: time,
          error: recovery,
        },
      ],
    };
    document.hostErrors = [{ phase: 'execution', error: recovery }];
    document.attempts![0].hostErrors = document.hostErrors;
    project.lifecycle = {
      status: 'failed',
      startedAt: time,
      endedAt: time,
      durationMs: 0,
      teardownErrors: [aggregate],
      cleanup: attempt.cleanup,
    };
    project.collectionErrors = [{ sourcePath: 'case.yaml', error: recovery }];
    dump.diagnostics = [
      {
        level: 'error',
        code: 'run-infrastructure-error',
        message: 'Recovery timed out',
        error: recovery,
      },
    ];
    return {
      reportId,
      sourcePath: `${reportId}.html`,
      dump,
      attributes: {
        testId: reportId,
        testTitle: reportId,
        testDescription: '',
        testStatus: 'passed' as const,
        testDuration: 0,
      },
    };
  });
  const before = JSON.stringify(sources);
  const merged = mergeTestRunReportDumps(
    sources,
    sources[0].dump.metrics,
    'merged',
  );
  merged.projects.forEach((project, index) => {
    const prefix = sources[index].reportId;
    const document = project.documents[0];
    const attempt = document.cases[0].attempts[0];
    const errors = [
      attempt.hostErrors![0].error,
      attempt.steps[0].error!,
      attempt.steps[0].operations!.events[0].error!,
      document.hostErrors![0].error,
      document.attempts![0].hostErrors![0].error,
      project.collectionErrors[0].error,
      merged.diagnostics![index].error!,
      attempt.teardownErrors![0].cause!,
      attempt.cleanup!.error!.cause!,
      attempt.steps[0].evidenceCollection!.errors![0].cause!,
      project.lifecycle!.teardownErrors![0].cause!,
      project.lifecycle!.cleanup!.error!.cause!,
    ];
    for (const error of errors) {
      expect(error.details).toEqual({
        value: {
          blockedByStepId: `${prefix}:step-0`,
          blockingOperations: [
            {
              operationId: 'operation',
              stepId: `${prefix}:step-0`,
              scopeId: `${prefix}:attempt-0`,
            },
          ],
          payload: { stepId: 'business-step' },
        },
        truncatedPaths: ['$.payload'],
      });
      expect(error.cause?.code).toBe('STEP_TIMEOUT');
      expect(
        attempt.steps.some(
          (step) =>
            step.id ===
            (error.details!.value as { blockedByStepId: string })
              .blockedByStepId,
        ),
      ).toBe(true);
    }
    expect(attempt.teardownErrors![0].errors![0].details?.value).toEqual({
      scopeId: `${prefix}:attempt-0`,
    });
  });
  expect(JSON.stringify(sources)).toBe(before);
  const custom = runnerDump('custom');
  custom.projects[0].documents[0].hostErrors = [
    {
      phase: 'execution',
      error: {
        name: 'CustomError',
        code: 'BUSINESS_ERROR',
        message: 'Custom payload',
        details: {
          value: {
            blockedByStepId: 'business-step',
            scopeId: 'business-scope',
          },
        },
      },
    },
  ];
  const customMerged = mergeTestRunReportDumps(
    [{ ...sources[0], dump: custom }],
    custom.metrics,
    'custom-merge',
  );
  expect(customMerged.projects[0].documents[0].hostErrors).toEqual(
    custom.projects[0].documents[0].hostErrors,
  );
});

test('preserves journal references and remaps blocked-step and event links on merge', () => {
  const dump = runnerDump('source');
  dump.operationLogs = [{ path: '/tmp/operations.jsonl', snapshotAt: time }];
  const attempt = dump.projects[0].documents[0].cases[0].attempts[0];
  attempt.steps.push({
    id: 'blocked',
    phase: 'steps',
    stepIndex: 1,
    node: 'aiAct',
    status: 'not-run',
    notRunReason: 'Agent still running',
    blockedBy: 'step-0',
    continuedAfterError: false,
    operations: {
      capturedAt: time,
      events: [
        {
          operationId: 'op',
          operationKind: 'node',
          kind: 'runner-returned',
          at: time,
          stepId: 'blocked',
          scopeId: 'attempt-0',
          status: 'not-run',
          pending: false,
        },
      ],
    },
  });
  const blocker = {
    operationId: 'root-operation',
    scopeId: 'attempt-0',
    stepId: 'step-0',
  };
  attempt.cleanup = {
    status: 'pending',
    capturedAt: time,
    operationId: 'cleanup-operation',
    blockingOperations: [blocker],
  };
  attempt.pendingOperations = [blocker];
  attempt.retryDecision = {
    scope: 'case',
    retryCount: 3,
    attemptIndex: 0,
    decision: 'stop',
    reason: 'cleanup-pending',
  };
  dump.projects[0].documents[0].cleanup = attempt.cleanup;
  dump.projects[0].lifecycle = {
    status: 'failed',
    startedAt: time,
    endedAt: time,
    durationMs: 0,
    cleanup: attempt.cleanup,
  };
  dump.diagnostics = [
    {
      level: 'warning',
      code: 'agent-detail-unresolved',
      message: 'Missing detail',
      scopeId: 'attempt-0',
      stepId: 'step-0',
    },
  ];
  attempt.steps[1].operations!.events[0].blockingOperations = [blocker];
  const merged = mergeTestRunReportDumps(
    [
      {
        reportId: 'merged-source',
        sourcePath: 'source.html',
        attributes: {
          testId: 'test',
          testTitle: 'test',
          testDescription: '',
          testStatus: 'passed',
          testDuration: 0,
        },
        dump,
      },
    ],
    dump.metrics,
    'merged-run',
  );
  const blocked = merged.projects[0].documents[0].cases[0].attempts[0].steps[1];
  expect(blocked).toMatchObject({
    id: 'merged-source:blocked',
    blockedBy: 'merged-source:step-0',
  });
  expect(blocked.operations?.events[0]).toMatchObject({
    operationId: 'op',
    stepId: 'merged-source:blocked',
    scopeId: 'merged-source:attempt-0',
  });
  expect(merged.operationLogs).toEqual(dump.operationLogs);
  const mergedAttempt = merged.projects[0].documents[0].cases[0].attempts[0];
  const expected = {
    operationId: 'root-operation',
    scopeId: 'merged-source:attempt-0',
    stepId: 'merged-source:step-0',
  };
  expect(mergedAttempt.cleanup?.blockingOperations).toEqual([expected]);
  expect(mergedAttempt.pendingOperations).toEqual([expected]);
  expect(mergedAttempt.retryDecision).toEqual(attempt.retryDecision);
  expect(merged.projects[0].documents[0].cleanup?.blockingOperations).toEqual([
    expected,
  ]);
  expect(merged.projects[0].lifecycle?.cleanup?.blockingOperations).toEqual([
    expected,
  ]);
  expect(merged.diagnostics?.[0].stepId).toBe('merged-source:step-0');
  expect(blocked.operations?.events[0].blockingOperations).toEqual([expected]);
});

function writeSource(
  name: string,
  dump?: TestRunReportDump,
  failed = false,
  options: {
    logTime?: number;
    timing?: { start: number; end: number };
    recordedStatus?: string;
  } = {},
) {
  const reportPath = join(directory, `${name}.html`);
  const agent = new ReportActionDump({
    groupName: name,
    sdkVersion: getVersion(),
    modelBriefs: [],
    executions: [
      new ExecutionDump({
        id: 'shared-execution',
        name: 'Submit',
        logTime: options.logTime ?? Date.parse(time),
        tasks: [
          {
            taskId: 'assert',
            type: 'Insight',
            subType: 'Assert',
            status: failed ? 'failed' : 'finished',
            timing: options.timing,
            param: {},
            recorder: [],
            executor: async () => undefined,
            usage: {
              prompt_tokens: 10,
              completion_tokens: 2,
              total_tokens: 12,
              time_cost: 20,
              model_name: 'test',
            } as AIUsageInfo,
          },
        ],
      }),
    ],
  });
  writeFileSync(
    reportPath,
    [
      generateDumpScriptTag(agent.serialize(), {
        'data-group-id': `${name}-group`,
        'data-report-id': `${name}-group`,
        ...(options.recordedStatus
          ? { playwright_test_status: options.recordedStatus }
          : {}),
      }),
      dump ? generateTestRunReportScriptTag(dump) : '',
    ].join('\n'),
  );
  return reportPath;
}

describe('merging Midscene Test reports', () => {
  test('merges independent usage with raw Agent reports without losing or double-counting calls', () => {
    const dump = runnerDump('source');
    const saved = sumTestRunReportMetrics([
      { ...dump.metrics, modelCallCount: 1, totalTokens: 12 },
    ]);
    const lost = sumTestRunReportMetrics([{ ...saved, totalTokens: 42 }]);
    dump.metrics = sumTestRunReportMetrics([saved, lost]);
    dump.executionMetrics = { saved, lost };
    const attributes = {
      testId: 'test',
      testTitle: 'test',
      testDescription: '',
      testStatus: 'passed' as const,
      testDuration: 0,
    };
    const merged = mergeTestRunReportDumps(
      [
        { reportId: 'runner', sourcePath: 'runner.html', attributes, dump },
        {
          reportId: 'raw',
          sourcePath: 'agent.html',
          attributes,
          timing: { startedAt: time, endedAt: time, durationMs: 0 },
        },
      ],
      sumTestRunReportMetrics([saved, { ...saved, totalTokens: 13 }]),
      'merged',
      { saved },
    );
    expect(merged.metrics).toMatchObject({
      modelCallCount: 3,
      totalTokens: 67,
      collection: { status: 'complete' },
    });
    expect(Object.keys(merged.executionMetrics!)).toEqual(['saved', 'lost']);
  });

  test('preserves incomplete metric coverage when merging with a complete report', () => {
    const complete = runnerDump('first');
    complete.metrics.collection = {
      status: 'complete',
      expectedExecutionCount: 1,
      capturedExecutionCount: 1,
      reasons: [],
      fields: {
        modelCallCount: 'complete',
        modelTimeMs: 'complete',
        totalTokens: 'complete',
      },
    };
    const unknown = runnerDump('second');
    unknown.metrics.collection = {
      status: 'unknown',
      expectedExecutionCount: 2,
      capturedExecutionCount: 0,
      reasons: ['Missing Agent source.'],
    };
    const attributes = {
      testId: 'test',
      testTitle: 'test',
      testDescription: '',
      testStatus: 'passed' as const,
      testDuration: 0,
    };
    const merged = mergeTestRunReportDumps(
      [
        {
          reportId: 'first',
          sourcePath: 'first.html',
          attributes,
          dump: complete,
        },
        {
          reportId: 'second',
          sourcePath: 'second.html',
          attributes,
          dump: unknown,
        },
      ],
      complete.metrics,
      'merged',
    );
    expect(merged.metrics.collection).toMatchObject({
      status: 'partial',
      expectedExecutionCount: 3,
      capturedExecutionCount: 1,
      reasons: ['Missing Agent source.'],
      fields: { totalTokens: 'partial' },
    });
  });
  test('rejects an invalid source execution timestamp', () => {
    const dump = runnerDump('invalid-group');
    dump.startedAt = '';
    const source = writeSource('invalid', dump);
    expect(() =>
      mergeReportFiles({
        htmlPaths: [source],
        outputDir: directory,
        outputName: 'invalid-time',
      }),
    ).toThrow('Invalid execution timestamps');
  });

  test.each(['failed', 'timedOut', 'interrupted'] as const)(
    'retains host %s without changing successful YAML actions',
    (testStatus) => {
      const sourceDump = runnerDump('yaml-group');
      const source = writeSource('yaml', sourceDump);
      const tool = new ReportMergingTool();
      tool.append({
        reportFilePath: source,
        reportAttributes: {
          testTitle: 'outer test',
          testId: 'outer',
          testDescription: '',
          testDuration: 100,
          testStatus,
        },
      });
      const output = tool.mergeReports('host-failed', {
        outputDir: directory,
      })!;
      const merged = extractTestRunReportDumpSync(output)!;
      expect(merged.status).toBe('failed');
      expect(merged.summary).toMatchObject({
        total: 1,
        passed: 1,
        failed: 0,
        documentFailures: 1,
      });
      expect(merged.projects[0].status).toBe('failed');
      const document = merged.projects[0].documents[0];
      expect(document.status).toBe('failed');
      expect(document.afterAll.at(-1)).toMatchObject({
        node: 'runner:host-result',
        status: 'failed',
        error: { message: expect.stringContaining(testStatus) },
      });
      expect(document.attempts?.at(-1)?.afterAll.at(-1)?.node).toBe(
        'runner:host-result',
      );
      expect(
        document.cases[0].attempts.map((attempt) => attempt.status),
      ).toEqual(['failed', 'success']);
      expect(document.cases[0].attempts.at(-1)?.steps[0].status).toBe(
        'success',
      );
      expect(sourceDump.status).toBe('success');
      const second = mergeReportFiles({
        htmlPaths: [output],
        outputDir: directory,
        outputName: 'again',
      });
      expect(
        extractTestRunReportDumpSync(second.mergedReportPath)?.summary
          .documentFailures,
      ).toBe(1);
    },
  );

  test('retains a recorded outer failure through the public merge API', () => {
    const source = writeSource('outer', runnerDump('outer-group'), false, {
      recordedStatus: 'failed',
    });
    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [source],
      outputDir: directory,
      outputName: 'host-status',
    });
    expect(extractTestRunReportDumpSync(mergedReportPath)?.status).toBe(
      'failed',
    );
  });

  test('uses source task timestamps for historical mixed reports', () => {
    const started = Date.parse(time) + 1000;
    const ended = started + 1500;
    const native = writeSource('native', runnerDump('native-group'));
    const plain = writeSource('historical', undefined, false, {
      timing: { start: started, end: ended },
    });
    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [native, plain],
      outputDir: directory,
      outputName: 'history',
    });
    const merged = extractTestRunReportDumpSync(mergedReportPath)!;
    expect(merged.startedAt).toBe(time);
    expect(merged.endedAt).toBe(new Date(ended).toISOString());
    expect(merged.durationMs).toBe(2500);
    expect(merged.projects[1].documents[0].cases[0].attempts[0]).toMatchObject({
      startedAt: new Date(started).toISOString(),
      endedAt: new Date(ended).toISOString(),
      durationMs: 1500,
    });
  });

  test('anchors timestamp-free tasks to their execution log time and supplied duration', () => {
    const native = writeSource('native', runnerDump('native-group'));
    const plain = writeSource('logged', undefined, false, {
      logTime: Date.parse(time) + 1000,
    });
    const tool = new ReportMergingTool();
    for (const [index, reportFilePath] of [native, plain].entries())
      tool.append({
        reportFilePath,
        reportAttributes: {
          testId: String(index),
          testTitle: 'source',
          testDescription: '',
          testStatus: 'passed',
          testDuration: 2000,
        },
      });
    const merged = extractTestRunReportDumpSync(
      tool.mergeReports('logs', { outputDir: directory })!,
    )!;
    expect(merged.endedAt).toBe(
      new Date(Date.parse(time) + 3000).toISOString(),
    );
    expect(merged.durationMs).toBe(3000);
  });

  test('does not invent attempt timestamps for an empty Agent report', () => {
    const native = writeSource('native', runnerDump('native-group'));
    const plain = join(directory, 'empty.html');
    writeFileSync(
      plain,
      generateDumpScriptTag(
        new ReportActionDump({
          groupName: 'empty',
          sdkVersion: getVersion(),
          modelBriefs: [],
          executions: [],
        }).serialize(),
        { 'data-group-id': 'empty' },
      ),
    );
    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [native, plain],
      outputDir: directory,
      outputName: 'empty-mixed',
    });
    const merged = extractTestRunReportDumpSync(mergedReportPath)!;
    expect(merged.startedAt).toBe(time);
    expect(merged.endedAt).toBe(time);
    expect(merged.projects[1].documents[0].cases[0].attempts).toEqual([]);
    expect(merged.projects[1].documents[0].scopeReportIds).toHaveLength(1);
  });

  test('preserves Unicode across streamed report chunks', () => {
    const dump = runnerDump('unicode-group');
    dump.projects[0].name = '中文'.repeat(40000);
    const source = writeSource('unicode', dump);
    expect(extractTestRunReportDumpSync(source)?.projects[0].name).toBe(
      dump.projects[0].name,
    );
  });

  test('preserves retry hierarchy and remaps every trace when IDs overlap across inputs', () => {
    const sources = ['first', 'second'].map((name) =>
      writeSource(name, runnerDump(`${name}-group`)),
    );
    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: sources,
      outputDir: directory,
      outputName: 'merged',
    });
    const merged = extractTestRunReportDumpSync(mergedReportPath)!;
    expect(merged.summary).toMatchObject({ total: 2, passed: 2 });
    expect(
      new Set(merged.projects.map((project) => project.projectId)).size,
    ).toBe(2);
    expect(merged.metrics).toMatchObject({
      totalTokens: 12,
      modelCallCount: 1,
    });
    const groups = extractAllDumpScriptsSync(mergedReportPath).filter((item) =>
      item.openTag.includes('data-report-id'),
    );
    for (const [index, project] of merged.projects.entries()) {
      const document = project.documents[0];
      expect(document.attempts?.map((attempt) => attempt.attemptIndex)).toEqual(
        [0, 1],
      );
      expect(document.attempts?.[0].teardownErrors?.[0].message).toBe(
        'old cleanup failed',
      );
      expect(
        document.cases[0].attempts.map((attempt) => attempt.status),
      ).toEqual(['failed', 'success']);
      const reportId = decodeURIComponent(
        groups[index].openTag.match(/data-report-id="([^"]+)"/)![1],
      );
      const group = JSON.parse(antiEscapeScriptTag(groups[index].content));
      for (const attempt of document.cases[0].attempts) {
        expect(attempt.scopeReportIds).toEqual([reportId]);
        expect(attempt.steps[0].agentDetails).toEqual([
          { reportId, executionId: 'shared-execution' },
        ]);
        expect(
          group.executions.some(
            (execution: { id: string }) =>
              execution.id === attempt.steps[0].agentDetails![0].executionId,
          ),
        ).toBe(true);
      }
      expect(
        document.attempts?.[0].beforeAll[0].agentDetails?.[0].reportId,
      ).toBe(reportId);
    }
    const documents = merged.projects.map((project) => project.documents[0]);
    expect(documents[0].documentId).not.toBe(documents[1].documentId);
    expect(documents[0].cases[0].caseId).not.toBe(documents[1].cases[0].caseId);
    const again = mergeReportFiles({
      htmlPaths: [mergedReportPath],
      outputDir: directory,
      outputName: 'merged-again',
    });
    const remerged = extractTestRunReportDumpSync(again.mergedReportPath)!;
    expect(remerged.summary).toEqual(merged.summary);
    expect(remerged.metrics).toEqual(merged.metrics);
    expect(
      remerged.projects
        .flatMap((project) => project.documents)
        .flatMap((document) => document.cases)
        .flatMap((testCase) => testCase.attempts)
        .flatMap((attempt) => attempt.steps)
        .flatMap((item) => item.agentDetails)
        .every((detail) => detail?.reportId === 'merged-group-0'),
    ).toBe(true);
  });

  test('keeps Agent-only inputs browsable when mixed with a Test report', () => {
    const native = writeSource('native', runnerDump('native-group'));
    const plain = writeSource('plain', undefined, true);
    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [native, plain],
      outputDir: directory,
      outputName: 'mixed',
    });
    const merged = extractTestRunReportDumpSync(mergedReportPath)!;
    expect(merged.status).toBe('failed');
    expect(merged.summary).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(merged.projects[1].documents[0].cases[0]).toMatchObject({
      name: 'plain',
      status: 'failed',
      attempts: [{ scopeReportIds: ['merged-group-1'] }],
    });
  });

  test('keeps pure Agent report merges in their original format', () => {
    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [writeSource('plain')],
      outputDir: directory,
      outputName: 'ordinary',
    });
    expect(extractTestRunReportDumpSync(mergedReportPath)).toBeUndefined();
    expect(readFileSync(mergedReportPath, 'utf8')).toContain(
      'playwright_test_status="passed"',
    );
  });
});
