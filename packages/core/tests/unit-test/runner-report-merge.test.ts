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
import type { TestRunReportDump, TestRunReportStep } from '@/test-run-report';
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
