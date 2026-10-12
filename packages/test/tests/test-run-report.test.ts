import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestRunReportSourceIndex } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import type { TestProjectRunResult } from '../src/cli/types';
import type { StepRunResult } from '../src/engine/types';
import {
  buildTestRunReportDump,
  renderTestResultMarkdown,
  sanitizeReportError,
  sanitizeReportValue,
  writeTestResultMarkdown,
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

describe('Midscene Test report manifest', () => {
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
      format: 'midscene-error',
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

describe('result.md', () => {
  it('renders one title and status per case without expanded details', () => {
    const failed = {
      ...step(),
      status: 'failed' as const,
      error: new Error('missing | <button> [x]'),
    };
    const run = result([failed]);
    run.status = 'failed';
    run.summary = { ...run.summary, passed: 0, failed: 1 };
    run.projects[0].cases[0].status = 'failed';
    const dump = buildTestRunReportDump(run, index);
    const markdown = renderTestResultMarkdown(dump, {
      reportHref: '../../../report/index.html',
    });
    expect(markdown).toContain('❌ **1 failed** · 0 passed · 0 not run');
    expect(markdown).toMatch(/^ {2}- ❌ \[submit\]\(<[^\n]+>\)$/m);
    expect(markdown).toContain('runner-step=');
    expect(markdown).not.toMatch(/<img|Reason:|Attempts:|missing/);
    expect(markdown).not.toContain('secret-key');
    expect(markdown).not.toContain('secret-token');
  });

  it('groups cases by source file without collapsing passed cases', () => {
    const dump = buildTestRunReportDump(result([step()]), index);
    dump.durationMs = 200900;
    const document = dump.projects[0].documents[0];
    document.sourcePath = 'cases/chat-core.yaml';
    const original = document.cases[0];
    document.cases = [
      { ...original, name: 'passed', status: 'success' },
      { ...original, name: 'failed', status: 'failed' },
      { ...original, name: 'pending', status: 'not-run', attempts: [] },
    ];
    dump.projects[0].documents.push({
      ...document,
      sourcePath: 'cases/apps.yaml',
      cases: [{ ...original, name: 'app' }],
    });
    const markdown = renderTestResultMarkdown(dump);
    expect(markdown).toContain(
      '- cases/chat-core\n  - ✅ passed\n  - ❌ failed\n  - ⏭️ pending',
    );
    expect(markdown).toContain('- cases/apps\n  - ✅ app');
    expect(markdown).toContain('3m 21s');
    expect(markdown).not.toContain('<details>');
  });

  it('omits zero counters when all cases pass', () => {
    const markdown = renderTestResultMarkdown(
      buildTestRunReportDump(result([step()]), index),
    );
    expect(markdown).toContain('✅ **1/1 passed**');
    expect(markdown).not.toMatch(/Infrastructure|Filtered|### Cases|<details>/);
  });

  it('writes result.md without an HTML report and records collection failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'midscene-result-md-'));
    try {
      const run = result([]);
      run.summaryPath = join(root, 'summary.json');
      run.status = 'failed';
      run.projects[0].cases = [];
      run.projects[0].collectionErrors = [
        {
          projectId: 'project-1',
          projectName: 'web',
          sourcePath: 'broken.yaml',
          error: new Error('Invalid document'),
        },
      ];
      run.summary = {
        ...run.summary,
        total: 0,
        passed: 0,
        collectionErrors: 1,
      };
      const output = await writeTestResultMarkdown(run);
      expect(output).toBe(join(root, 'result.md'));
      const markdown = await readFile(output, 'utf8');
      expect(markdown).toContain('Invalid document');
      expect(markdown).toContain('No cases were reported.');
      expect(markdown).not.toContain('Open the Midscene');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('links the HTML report relative to result.md and overwrites on rewrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'midscene-result-md-'));
    try {
      const run = result([step()]);
      run.summaryPath = join(root, 'summary.json');
      run.reportPath = join(root, 'report space', 'index.html');
      const output = await writeTestResultMarkdown(run, index);
      await writeTestResultMarkdown(run, index);
      const markdown = await readFile(output, 'utf8');
      expect(markdown).toContain('report%20space/index.html');
      expect(markdown).not.toContain('<img');
      expect(markdown.match(/## Midscene Test/g)).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
