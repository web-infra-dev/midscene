import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  TestRunReportSourceIndex,
  TestRunReportStep,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import type { TestProjectRunResult } from '../src/cli/types';
import type { StepRunResult } from '../src/engine/types';
import { WorkflowError } from '../src/errors';
import {
  buildTestRunReportDump,
  renderTestResultJUnit,
  writeTestResultJUnit,
} from '../src/report';

const step = (
  executionId = 'execution-1',
): Extract<StepRunResult, { status: 'success' | 'failed' }> => ({
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
    passedAfterRetry: 0,
    finalPassRate: 1,
    firstPassRate: 1,
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

const failedStep = (
  message: string,
): Extract<StepRunResult, { status: 'success' | 'failed' }> => ({
  ...step('execution-2'),
  phase: 'beforeAll',
  status: 'failed',
  error: new WorkflowError(message),
});

describe('JUnit result', () => {
  it('writes one testsuite per file and one testcase per Case', () => {
    const dump = buildTestRunReportDump(result([step()]), index);
    const document = dump.projects[0].documents[0];
    document.sourcePath = 'cases/checkout.yaml';
    const original = document.cases[0];
    document.cases = [
      { ...original, name: 'passed', status: 'success' },
      {
        ...original,
        name: 'failed',
        status: 'failed',
        attempts: [
          {
            ...original.attempts[0],
            status: 'failed',
            steps: [
              {
                ...(original.attempts[0].steps[0] as Extract<
                  TestRunReportStep,
                  { status: 'success' | 'failed' }
                >),
                status: 'failed',
                error: { name: 'Error', message: 'Expected "Paid" <badge>' },
              },
            ],
          },
        ],
      },
      {
        ...original,
        name: 'pending',
        status: 'not-run',
        notRunReason: 'Blocked by "failed"',
        attempts: [],
      },
    ];

    const xml = renderTestResultJUnit(dump);

    expect(xml).toMatch(
      /^<\?xml version="1.0" encoding="UTF-8"\?>\n<testsuites /,
    );
    expect(xml).toContain(
      '<testsuites name="Midscene Test" tests="3" failures="1" errors="0" skipped="1"',
    );
    expect(xml).toContain(
      '<testsuite name="cases/checkout.yaml" tests="3" failures="1" errors="0" skipped="1" time="1.000"',
    );
    expect(xml).toContain(
      '<testcase name="passed" classname="cases/checkout" file="cases/checkout.yaml" time="1.000"/>',
    );
    expect(xml).toContain(
      '<failure message="steps / Submit order: Expected &quot;Paid&quot; &lt;badge&gt;">',
    );
    expect(xml).toContain('<skipped message="Blocked by &quot;failed&quot;"/>');
    expect(xml).not.toContain('secret-key');
  });

  it('reports failures outside any Case as errors', () => {
    const run = result([step()]);
    run.projects[0].documents[0].beforeAll = [
      failedStep('Browser did not start'),
    ];
    run.projects[0].collectionErrors = [
      {
        projectId: 'project-1',
        projectName: 'web',
        sourcePath: 'broken.yaml',
        error: new WorkflowError('Unknown node "aiClick"'),
      },
    ];
    const dump = buildTestRunReportDump(run, index);

    const xml = renderTestResultJUnit(dump);

    expect(xml).toContain('tests="3" failures="0" errors="2" skipped="0"');
    expect(xml).toContain(
      '<testcase name="(collection)" classname="broken.yaml"',
    );
    expect(xml).toContain('<error message="Unknown node &quot;aiClick&quot;">');
    expect(xml).toContain('<testcase name="(file hooks)" classname="case"');
    expect(xml).toContain('beforeAll / Submit order: Browser did not start');
  });

  it('drops characters XML 1.0 cannot represent', () => {
    const dump = buildTestRunReportDump(result([step()]), index);
    dump.projects[0].documents[0].cases[0].name = 'bell\u0007 & tab\t';

    expect(renderTestResultJUnit(dump)).toContain('name="bell &amp; tab\t"');
  });

  it('writes junit.xml beside the summary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'midscene-junit-'));
    try {
      const run = result([step()]);
      run.summaryPath = join(dir, 'summary.json');

      const output = await writeTestResultJUnit(run);

      expect(output).toBe(join(dir, 'junit.xml'));
      expect(await readFile(output, 'utf8')).toContain(
        '<testcase name="submit" classname="case" file="case.yaml"',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
