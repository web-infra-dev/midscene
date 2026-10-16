import type {
  TestRunReportAttempt,
  TestRunReportDump,
  TestRunReportMetrics,
  TestRunReportStep,
} from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlaywrightTasks } from '../../types';
import { CaseWorkspace, getWorkspaceStepSummary } from './case-workspace';
import {
  CaseExecutionToolbar,
  CaseWorkspaceHeader,
} from './case-workspace-header';
import { ErrorCards } from './error-card';
import { collectReportIssues } from './issues';
import {
  buildRunnerStepIndex,
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getAllAttemptVisualFrames,
  getAttemptVisualFrames,
  getCaseSearchMatch,
  getCaseTokenSummary,
  getDefaultVisualFrameForStep,
  getRunnerHealth,
  getStepForVisualFrame,
  groupRunnerProjects,
  positionAttemptVisualFrames,
} from './model';
import { isSingleCaseReport, resolveRunnerNavigation } from './navigation';
import { RunSummary } from './run-summary';

const at = (seconds: number): string =>
  new Date(Date.UTC(2026, 7, 21, 8, 0, seconds)).toISOString();

const step = (
  id: string,
  status: Exclude<TestRunReportStep['status'], 'not-run'> = 'success',
  extra: Partial<Exclude<TestRunReportStep, { status: 'not-run' }>> = {},
): TestRunReportStep => ({
  id,
  phase: 'steps',
  stepIndex: 0,
  node: id,
  status,
  continuedAfterError: false,
  startedAt: at(3),
  endedAt: at(4),
  durationMs: 1_000,
  ...extra,
});

const attempt = (
  attemptId: string,
  attemptIndex: number,
  status: TestRunReportAttempt['status'],
  startSecond: number,
  endSecond: number,
  steps: TestRunReportStep[],
): TestRunReportAttempt => ({
  attemptId,
  attemptIndex,
  status,
  startedAt: at(startSecond),
  endedAt: at(endSecond),
  durationMs: (endSecond - startSecond) * 1_000,
  beforeEach: [],
  steps,
  afterEach: [],
});

const dump: TestRunReportDump = {
  schemaVersion: 1,
  kind: 'test-runner',
  runId: 'run-1',
  status: 'failed',
  startedAt: at(0),
  endedAt: at(10),
  durationMs: 10_000,
  summary: {
    total: 4,
    passed: 2,
    failed: 1,
    notRun: 1,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 1,
    projectFailures: 1,
  },
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
  projects: [
    {
      projectId: 'web',
      name: 'Web',
      platform: 'web',
      status: 'failed',
      retry: 1,
      lifecycle: {
        status: 'failed',
        startedAt: at(1),
        endedAt: at(9),
        durationMs: 8_000,
      },
      collectionErrors: [],
      documents: [
        {
          documentId: 'document',
          sourcePath: 'cases.yaml',
          status: 'failed',
          startedAt: at(3),
          endedAt: at(8),
          durationMs: 5_000,
          beforeAll: [],
          afterAll: [],
          cases: [
            {
              caseId: 'passed',
              name: 'Passed immediately',
              caseIndex: 0,
              status: 'success',
              attempts: [
                attempt('passed-1', 0, 'success', 3, 4, [
                  step('open', 'success', { title: 'Open the page' }),
                ]),
              ],
            },
            {
              caseId: 'retried',
              name: 'Passed on retry',
              caseIndex: 1,
              status: 'success',
              attempts: [
                attempt('retry-1', 0, 'failed', 4, 5, [
                  step('demo.passOnRetry', 'failed', {
                    error: {
                      name: 'NodeExecutionError',
                      code: 'NODE_EXECUTION_ERROR',
                      message: 'Could not find 无线耳机 in the result list',
                    },
                    input: {
                      value: { selector: '[data-product="headphones"]' },
                    },
                    agentDetails: [
                      {
                        reportId: 'technical-report-id',
                        executionId: 'execution-retry-1',
                      },
                    ],
                  }),
                ]),
                attempt('retry-2', 1, 'success', 5, 6, [
                  step('search', 'success', { title: 'Search for headphones' }),
                  step('assert', 'success', {
                    output: { summary: 'Verify the result list' },
                  }),
                ]),
              ],
            },
            {
              caseId: 'failed',
              name: 'Failed finally',
              caseIndex: 2,
              status: 'failed',
              attempts: [
                attempt('failed-1', 0, 'failed', 6, 7, [
                  step('assert', 'failed'),
                ]),
              ],
            },
            {
              caseId: 'not-run',
              name: 'Not run',
              caseIndex: 3,
              status: 'not-run',
              notRunReason: 'bail',
              attempts: [],
            },
          ],
        },
      ],
    },
  ],
};

const tokenMetrics = (
  totalTokens: number,
  status: 'complete' | 'partial' | 'unknown' = 'complete',
): TestRunReportMetrics => ({
  modelCallCount: 1,
  modelTimeMs: 100,
  promptTokens: totalTokens,
  cachedInputTokens: 0,
  completionTokens: 0,
  totalTokens,
  collection: {
    status,
    expectedExecutionCount: 1,
    capturedExecutionCount: status === 'unknown' ? 0 : 1,
    reasons: [],
  },
});

describe('Midscene Test hybrid report model', () => {
  it('separates final pass rate from first-pass stability', () => {
    const cases = flattenRunnerCases(dump);
    expect(cases.map((item) => item.status)).toEqual([
      'passed',
      'retry-passed',
      'failed',
      'not-run',
    ]);
    expect(getRunnerHealth(cases)).toEqual({
      executed: 3,
      firstPassCount: 1,
      retryPassedCount: 1,
      finalPassRate: 2 / 3,
      firstPassRate: 1 / 3,
    });
  });

  it('groups health and cases into first-class Project views', () => {
    const cases = flattenRunnerCases(dump);
    expect(groupRunnerProjects(dump, cases)).toMatchObject([
      {
        key: 'web',
        passedCount: 2,
        failedCount: 1,
        retryPassedCount: 1,
        notRunCount: 1,
        durationMs: 8_000,
        health: {
          executed: 3,
          firstPassCount: 1,
          retryPassedCount: 1,
          finalPassRate: 2 / 3,
          firstPassRate: 1 / 3,
        },
        cases: [
          { key: 'web:document:passed' },
          { key: 'web:document:retried' },
          { key: 'web:document:failed' },
          { key: 'web:document:not-run' },
        ],
      },
    ]);
  });

  it('opens a single-project single-case report directly in case detail', () => {
    const singleDump = structuredClone(dump);
    singleDump.projects[0].documents[0].cases = [
      singleDump.projects[0].documents[0].cases[0],
    ];
    const cases = flattenRunnerCases(singleDump);
    const projects = groupRunnerProjects(singleDump, cases);
    const stepIndex = buildRunnerStepIndex(singleDump, cases);
    expect(
      resolveRunnerNavigation('', cases, projects, stepIndex),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: cases[0].key,
    });
    expect(
      resolveRunnerNavigation(
        '#runner-page=overview',
        cases,
        projects,
        stepIndex,
      ).page,
    ).toBe('overview');
    expect(
      resolveRunnerNavigation(
        '#runner-page=project&runner-project=web',
        cases,
        projects,
        stepIndex,
      ).page,
    ).toBe('overview');
    const allCases = flattenRunnerCases(dump);
    expect(
      resolveRunnerNavigation(
        '',
        allCases,
        projects,
        buildRunnerStepIndex(dump, allCases),
      ).page,
    ).toBe('overview');
    expect(
      resolveRunnerNavigation(
        '',
        cases,
        [...projects, { ...projects[0], key: 'other' }],
        stepIndex,
      ).page,
    ).toBe('overview');
    expect(resolveRunnerNavigation('', [], projects, []).page).toBe('overview');
  });

  it('does not treat a filtered multi-case report as a standalone case', () => {
    const filteredCases = flattenRunnerCases(dump).slice(0, 1);
    const projects = groupRunnerProjects(dump, filteredCases);
    expect(isSingleCaseReport(projects)).toBe(false);
    expect(
      resolveRunnerNavigation(
        '',
        filteredCases,
        projects,
        buildRunnerStepIndex(dump, filteredCases),
      ).page,
    ).toBe('overview');
  });

  it('routes multi-case reports between overview and case detail only', () => {
    const cases = flattenRunnerCases(dump);
    const projects = groupRunnerProjects(dump, cases);
    const stepIndex = buildRunnerStepIndex(dump, cases);
    expect(
      resolveRunnerNavigation(
        '#runner-page=project&runner-project=web',
        cases,
        projects,
        stepIndex,
      ),
    ).toEqual({ page: 'overview' });
    const target = cases[0];
    const hash = `#runner-page=case&runner-project=${encodeURIComponent(target.project.projectId)}&runner-case=${encodeURIComponent(target.key)}`;
    expect(
      resolveRunnerNavigation(hash, cases, projects, stepIndex),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: target.key,
    });
    expect(resolveRunnerNavigation('#', cases, projects, stepIndex)).toEqual({
      page: 'overview',
    });
  });

  it('preserves single-case step links and rejects unrelated step IDs', () => {
    const singleDump = structuredClone(dump);
    singleDump.projects[0].documents[0].cases = [
      singleDump.projects[0].documents[0].cases[1],
    ];
    const cases = flattenRunnerCases(singleDump);
    const projects = groupRunnerProjects(singleDump, cases);
    const stepIndex = buildRunnerStepIndex(singleDump, cases);
    expect(
      resolveRunnerNavigation(
        '#runner-step=demo.passOnRetry',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      page: 'case',
      deepLinkedStepId: 'demo.passOnRetry',
    });
    expect(
      resolveRunnerNavigation(
        '#runner-page=overview&runner-step=missing',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      page: 'overview',
      navigationIssue: { code: 'STEP_NOT_FOUND' },
    });
  });

  it('hides standalone back navigation without losing run metrics or diagnostics', () => {
    const item = flattenRunnerCases(dump)[0];
    const props = {
      item,
      selectedAttempt: item.finalAttempt,
      backLabel: 'Overview',
      onBack() {},
      onSelectAttempt() {},
    };
    const run = structuredClone(dump);
    run.projects[0].lifecycle!.teardownErrors = [
      { name: 'Error', message: 'Browser cleanup failed' },
    ];
    run.diagnostics = [
      {
        code: 'agent-detail-unavailable',
        level: 'warning',
        message: 'Trace unavailable',
      },
    ];
    const issues = collectReportIssues(run);
    const standalone = renderToStaticMarkup(
      createElement(CaseWorkspace, {
        item,
        standaloneRun: run,
        issues,
        reports: [],
        visualIndex: buildRunnerVisualIndex([]),
        renderAgentReport: () => null,
        onBack() {},
        backLabel: 'Overview',
      }),
    );
    expect(standalone).not.toContain('runner-back-button');
    expect(standalone).not.toContain('Copy case link');
    expect(standalone).not.toContain('runner-attempt-switcher');
    expect(standalone).toContain('run time');
    expect(standalone).toContain('model calls');
    expect(standalone).toContain('tokens');
    expect(standalone).not.toContain('Run diagnostics');
    expect(standalone).toContain('Browser cleanup failed');
    expect(standalone).toContain('View all 3 issues');
    expect(issues.others).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Trace unavailable' }),
      ]),
    );
    const regular = renderToStaticMarkup(
      createElement(CaseWorkspaceHeader, props),
    );
    expect(regular).toContain('runner-back-button');
    expect(regular).not.toContain('Copy case link');
    expect(regular).not.toContain('Run information');
    expect(regular).not.toContain('Attempt 1');
    expect(regular).not.toContain('aria-label="Attempts"');
    expect(regular).not.toContain('runner-step-status is-success');
  });

  it('shows cumulative Case tokens before Case time, including retries and per-case hooks only', () => {
    const run = structuredClone(dump);
    const item = flattenRunnerCases(run)[1];
    item.document.beforeAll = [
      step('shared-setup', 'success', { metrics: tokenMetrics(9_000) }),
    ];
    item.document.afterAll = [
      step('shared-teardown', 'success', { metrics: tokenMetrics(8_000) }),
    ];
    item.document.cases[0].attempts[0].steps[0].metrics = tokenMetrics(7_000);
    const [first, second] = item.testCase.attempts;
    first.beforeEach = [
      step('setup', 'success', { metrics: tokenMetrics(35) }),
    ];
    first.afterEach = [
      step('teardown', 'success', { metrics: tokenMetrics(15) }),
    ];
    first.steps[0].metrics = tokenMetrics(1_000);
    second.steps[0].metrics = tokenMetrics(2_000);
    second.steps[1].metrics = tokenMetrics(500);

    expect(getCaseTokenSummary(item.testCase)).toEqual({
      totalTokens: 3_550,
      status: 'complete',
    });
    const markup = renderToStaticMarkup(
      createElement(CaseWorkspaceHeader, {
        item,
        backLabel: 'Overview',
        onBack() {},
      }),
    );
    expect(markup).toContain('Tokens<strong>3,550</strong>');
    expect(markup.indexOf('Tokens<strong>')).toBeLessThan(
      markup.indexOf('Case time'),
    );
  });

  it.each(['complete', 'partial', 'unknown'] as const)(
    'renders %s Case token collection without turning missing usage into zero',
    (status) => {
      const item = flattenRunnerCases(structuredClone(dump))[0];
      item.testCase.attempts[0].steps[0].metrics = tokenMetrics(1_234, status);
      const markup = renderToStaticMarkup(
        createElement(CaseWorkspaceHeader, {
          item,
          backLabel: 'Overview',
          onBack() {},
        }),
      );
      expect(markup).toContain(
        `Tokens<strong>${status === 'unknown' ? '—' : '1,234'}</strong>`,
      );
      expect(markup.includes('(partial)')).toBe(status === 'partial');
    },
  );

  it.each([500, 0])(
    'keeps known %i tokens when another request has unknown usage',
    (known) => {
      const item = flattenRunnerCases(structuredClone(dump))[0];
      item.testCase.attempts[0].steps = [
        step('known', 'success', { metrics: tokenMetrics(known) }),
        step('unknown', 'failed', { metrics: tokenMetrics(9_999, 'unknown') }),
      ];
      expect(getCaseTokenSummary(item.testCase)).toEqual({
        totalTokens: known,
        status: 'partial',
      });
    },
  );

  it('uses token collection status independently of missing model timing', () => {
    const item = flattenRunnerCases(structuredClone(dump))[0];
    const metrics = tokenMetrics(500, 'partial');
    metrics.collection!.fields = {
      totalTokens: 'complete',
      modelCallCount: 'complete',
      modelTimeMs: 'unknown',
    };
    item.testCase.attempts[0].steps[0].metrics = metrics;
    expect(getCaseTokenSummary(item.testCase)).toEqual({
      totalTokens: 500,
      status: 'complete',
    });
  });

  it('marks missing traced usage as unknown while keeping Cases without model calls at zero', () => {
    const cases = flattenRunnerCases(dump);
    expect(getCaseTokenSummary(cases[1].testCase).status).toBe('unknown');
    for (const index of [0, 3])
      expect(getCaseTokenSummary(cases[index].testCase)).toEqual({
        totalTokens: 0,
        status: 'complete',
      });
    const testCase = structuredClone(cases[0].testCase);
    testCase.attempts[0].steps[0].evidenceCollection = {
      status: 'unknown',
      modelUsageUnavailable: true,
    };
    expect(getCaseTokenSummary(testCase).status).toBe('unknown');
  });

  it('shows final case counts including retries and not-run cases in the compact summary', () => {
    const markup = renderToStaticMarkup(
      createElement(RunSummary, {
        dump,
        health: getRunnerHealth(flattenRunnerCases(dump)),
        totalCaseCount: 4,
        onReviewOutcome() {},
      }),
    );
    expect(markup).toContain('Review case results: 2 of 4 passed');
    expect(markup).toContain('<span>Passed</span><strong>1</strong>');
    expect(markup).toContain(
      '<span>Passed after retry</span><strong>1</strong>',
    );
    expect(markup).toContain('<span>Not run</span><strong>1</strong>');
    expect(markup).toContain(
      'aria-label="1 Passed without retry, 1 Failed, 1 Passed after retry, 1 Not run"',
    );
    expect(markup).toContain('tokens<strong>—</strong>');
    expect(markup).not.toContain('runner-overview-outcome-message');
    expect(markup).toContain('>run failed</span>');
    expect(markup).not.toContain('>Run failed</span>');
    expect(markup).not.toContain('model time');
    expect(markup).not.toContain('model calls');
    expect(markup).not.toContain('Tokens');
  });

  it('shows zero case counts without inventing token usage for an empty run', () => {
    const markup = renderToStaticMarkup(
      createElement(RunSummary, {
        dump: {
          ...dump,
          summary: {
            ...dump.summary,
            total: 0,
            passed: 0,
            failed: 0,
            notRun: 0,
          },
        },
        health: getRunnerHealth([]),
        totalCaseCount: 0,
        onReviewOutcome() {},
      }),
    );
    expect(markup).toContain('Review case results: 0 of 0 passed');
    expect(markup).toContain('tokens<strong>—</strong>');
    expect(markup).toContain(
      'aria-label="0 Passed without retry, 0 Failed, 0 Passed after retry, 0 Not run"',
    );
    expect(markup).not.toContain('flex-grow:');
    expect(markup).not.toContain('NaN');
  });

  it('keeps retry-passed cases in the total while rendering each case only once in the distribution', () => {
    const markup = renderToStaticMarkup(
      createElement(RunSummary, {
        dump: {
          ...dump,
          status: 'success',
          summary: {
            ...dump.summary,
            total: 2,
            passed: 2,
            failed: 0,
            notRun: 0,
          },
        },
        health: { ...getRunnerHealth([]), retryPassedCount: 2 },
        totalCaseCount: 2,
        onReviewOutcome() {},
      }),
    );
    expect(markup).toContain('Review case results: 2 of 2 passed');
    expect(markup).toContain('<span>Passed</span><strong>0</strong>');
    expect(markup).toContain(
      '<span>Passed after retry</span><strong>2</strong>',
    );
    expect(markup.match(/flex-grow:/g)).toHaveLength(1);
    expect(markup).toContain('title="Passed after retry"');
  });

  it('marks partial token totals and distinguishes a measured zero from unknown usage', () => {
    for (const status of ['complete', 'partial'] as const) {
      const markup = renderToStaticMarkup(
        createElement(RunSummary, {
          dump: {
            ...dump,
            metrics: {
              ...dump.metrics,
              collection: {
                status,
                expectedExecutionCount: 1,
                capturedExecutionCount: 1,
                reasons: [],
              },
            },
          },
          health: getRunnerHealth(flattenRunnerCases(dump)),
          totalCaseCount: 4,
          onReviewOutcome() {},
        }),
      );
      expect(markup).toContain('tokens<strong>0</strong>');
      expect(markup.includes('(partial)')).toBe(status === 'partial');
    }
  });

  it('keeps attempt comparison in standalone reports with retries', () => {
    const item = flattenRunnerCases(dump)[1];
    const props = {
      item,
      standaloneRun: dump,
      selectedAttempt: item.finalAttempt,
      stepSummary: { total: 12, passed: 11, failed: 1, timeout: 0 },
      backLabel: 'Overview',
      onBack() {},
      onSelectAttempt() {},
    };
    const markup = renderToStaticMarkup(
      createElement(CaseExecutionToolbar, { ...props, viewSwitch: null }),
    );
    expect(markup).not.toContain('runner-back-button');
    expect(markup).toContain('Attempt 2');
    expect(markup).not.toContain('Original failure');
    expect(markup).not.toContain('Final result');
    expect(markup).not.toContain('· failed');
    expect(markup).toContain('aria-label="Attempts"');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('runner-select-chevron');
    expect(markup).toContain('<dt>Total steps</dt><dd>12</dd>');
    const firstAttemptMarkup = renderToStaticMarkup(
      createElement(CaseExecutionToolbar, {
        viewSwitch: null,
        ...props,
        selectedAttempt: item.testCase.attempts[0],
      }),
    );
    expect(firstAttemptMarkup).toContain('Attempt 1');
    expect(firstAttemptMarkup).toContain('is-failed');
  });

  it('keeps retries reachable in Execution when the selected attempt has no steps', () => {
    const item = structuredClone(flattenRunnerCases(dump)[1]);
    item.document.beforeAll = [];
    item.document.afterAll = [];
    for (const attempt of item.testCase.attempts) {
      attempt.beforeEach = [];
      attempt.steps = [];
      attempt.afterEach = [];
    }
    const markup = renderToStaticMarkup(
      createElement(CaseWorkspace, {
        item,
        reports: [],
        visualIndex: buildRunnerVisualIndex([]),
        renderAgentReport: () => null,
        onBack() {},
        backLabel: 'Overview',
      }),
    );
    expect(markup).toMatch(
      /aria-label="Execution"[\s\S]*runner-detail-panel-heading[\s\S]*aria-label="Execution view"[\s\S]*aria-label="Attempts"[\s\S]*<dt>Total steps<\/dt><dd>0<\/dd>/,
    );
    expect(markup).toContain('Attempt 2');
  });

  it('keeps timeout failures separate in the detail step summary', () => {
    expect(
      getWorkspaceStepSummary([
        step('passed'),
        step('failed', 'failed', {
          error: { name: 'Error', message: 'Regular failure' },
        }),
        step('timeout', 'failed', {
          error: {
            name: 'StepTimeoutError',
            code: 'STEP_TIMEOUT',
            message: 'Step timed out after 1000ms.',
          },
        }),
      ]),
    ).toEqual({ total: 3, passed: 1, failed: 1, timeout: 1, notRun: 0 });
  });

  it('preserves step deep links when choosing the initial page', () => {
    const cases = flattenRunnerCases(dump);
    const projects = groupRunnerProjects(dump, cases);
    const stepIndex = buildRunnerStepIndex(dump, cases);
    const target = cases.find((item) => item.finalAttempt?.steps.length);
    if (!target?.finalAttempt) throw new Error('Fixture needs a step');
    const stepId = target.finalAttempt.steps[0].id;
    expect(
      resolveRunnerNavigation(
        `#runner-step=${encodeURIComponent(stepId)}`,
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: target.key,
      deepLinkedStepId: stepId,
    });
  });

  it('resolves portable first, last, and error Step links', () => {
    const cases = flattenRunnerCases(dump);
    const projects = groupRunnerProjects(dump, cases);
    const stepIndex = buildRunnerStepIndex(dump, cases);

    expect(
      resolveRunnerNavigation('#runner-step=first', cases, projects, stepIndex),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: 'web:document:passed',
      deepLinkedStepId: 'open',
    });
    expect(
      resolveRunnerNavigation('#runner-step=last', cases, projects, stepIndex),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: 'web:document:failed',
      deepLinkedStepId: 'assert',
    });
    expect(
      resolveRunnerNavigation(
        '#runner-step=first-error',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: 'web:document:retried',
      deepLinkedStepId: 'demo.passOnRetry',
    });
    expect(
      resolveRunnerNavigation(
        '#runner-step=last-error',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: 'web:document:failed',
      deepLinkedStepId: 'assert',
    });
  });

  it('resolves portable Step links by execution time across concurrent Projects', () => {
    const concurrentDump = structuredClone(dump);
    const buildProject = (
      projectId: string,
      stepId: string,
      startedAt: string,
      endedAt: string,
    ) => {
      const project = structuredClone(dump.projects[0]);
      project.projectId = projectId;
      const [document] = project.documents;
      document.documentId = `${projectId}-document`;
      const testCase = structuredClone(document.cases[0]);
      testCase.caseId = `${projectId}-case`;
      const targetStep = testCase.attempts[0].steps[0];
      targetStep.id = stepId;
      targetStep.status = 'failed';
      targetStep.startedAt = startedAt;
      targetStep.endedAt = endedAt;
      document.beforeAll = [];
      document.cases = [testCase];
      document.afterAll = [];
      return project;
    };
    concurrentDump.projects = [
      buildProject('alpha', 'alpha-step', at(2), at(10)),
      buildProject('beta', 'beta-step', at(1), at(3)),
    ];
    const cases = flattenRunnerCases(concurrentDump);
    const projects = groupRunnerProjects(concurrentDump, cases);
    const stepIndex = buildRunnerStepIndex(concurrentDump, cases);

    expect(
      resolveRunnerNavigation('#runner-step=first', cases, projects, stepIndex),
    ).toMatchObject({
      selectedCaseKey: 'beta:beta-document:beta-case',
      deepLinkedStepId: 'beta-step',
    });
    expect(
      resolveRunnerNavigation('#runner-step=last', cases, projects, stepIndex),
    ).toMatchObject({
      selectedCaseKey: 'alpha:alpha-document:alpha-case',
      deepLinkedStepId: 'alpha-step',
    });
    expect(
      resolveRunnerNavigation(
        '#runner-step=first-error',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({ deepLinkedStepId: 'beta-step' });
    expect(
      resolveRunnerNavigation(
        '#runner-step=last-error',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({ deepLinkedStepId: 'alpha-step' });
  });

  it('reports an unmatched error selector without selecting an unrelated trace', () => {
    const passingDump = structuredClone(dump);
    passingDump.projects[0].documents[0].cases = [
      passingDump.projects[0].documents[0].cases[0],
    ];
    const cases = flattenRunnerCases(passingDump);
    const projects = groupRunnerProjects(passingDump, cases);
    const stepIndex = buildRunnerStepIndex(passingDump, cases);

    expect(
      resolveRunnerNavigation(
        '#runner-step=last-error',
        cases,
        projects,
        stepIndex,
      ),
    ).toEqual({
      page: 'case',
      selectedCaseKey: 'web:document:passed',
      deepLinkedStepId: undefined,
      navigationIssue: {
        id: 'navigation',
        severity: 'warning',
        code: 'STEP_NOT_FOUND',
        message: 'No Step matches runner-step=last-error.',
      },
    });
  });

  it('scopes a portable Step selector to an explicit Case route', () => {
    const cases = flattenRunnerCases(dump);
    const projects = groupRunnerProjects(dump, cases);
    const stepIndex = buildRunnerStepIndex(dump, cases);
    expect(
      resolveRunnerNavigation(
        '#runner-page=case&runner-project=web&runner-case=web%3Adocument%3Apassed&runner-step=last',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: 'web:document:passed',
      deepLinkedStepId: 'open',
    });
    expect(
      resolveRunnerNavigation(
        '#runner-page=case&runner-project=web&runner-case=web%3Adocument%3Apassed&runner-step=last-error',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: 'web:document:passed',
      deepLinkedStepId: undefined,
      navigationIssue: {
        severity: 'warning',
        code: 'STEP_NOT_FOUND',
      },
    });
  });

  it.each(['last-error', 'missing-step-id'])(
    'shows a warning for an unresolved Step link (%s)',
    (reference) => {
      const cases = flattenRunnerCases(dump);
      const projects = groupRunnerProjects(dump, cases);
      const stepIndex = buildRunnerStepIndex(dump, cases);
      const navigation = resolveRunnerNavigation(
        `#runner-page=case&runner-project=web&runner-case=web%3Adocument%3Apassed&runner-step=${reference}`,
        cases,
        projects,
        stepIndex,
      );
      expect(navigation).toMatchObject({
        page: 'case',
        selectedCaseKey: 'web:document:passed',
        deepLinkedStepId: undefined,
        navigationIssue: { severity: 'warning', code: 'STEP_NOT_FOUND' },
      });
      const html = renderToStaticMarkup(
        createElement(ErrorCards, {
          label: 'Navigation issue',
          issues: [navigation.navigationIssue!],
        }),
      );
      expect(html).toContain('is-warning');
      expect(html).toContain('The requested step could not be found');
      expect(html).toContain(`No Step matches runner-step=${reference}.`);
    },
  );

  it('includes document lifecycle Steps in portable links', () => {
    const lifecycleDump = structuredClone(dump);
    const [document] = lifecycleDump.projects[0].documents;
    document.beforeAll = [step('document:beforeAll:0')];
    document.afterAll = [step('document:afterAll:0', 'failed')];
    const cases = flattenRunnerCases(lifecycleDump);
    const projects = groupRunnerProjects(lifecycleDump, cases);
    const stepIndex = buildRunnerStepIndex(lifecycleDump, cases);

    expect(
      resolveRunnerNavigation('#runner-step=first', cases, projects, stepIndex),
    ).toMatchObject({
      deepLinkedStepId: 'document:beforeAll:0',
    });
    expect(
      resolveRunnerNavigation('#runner-step=last', cases, projects, stepIndex),
    ).toMatchObject({
      deepLinkedStepId: 'document:afterAll:0',
    });
    expect(
      resolveRunnerNavigation(
        '#runner-step=last-error',
        cases,
        projects,
        stepIndex,
      ),
    ).toMatchObject({
      deepLinkedStepId: 'document:afterAll:0',
    });
  });

  it('searches failed retries, errors, values, and trace identifiers', () => {
    const retryCase = flattenRunnerCases(dump)[1];
    expect(getCaseSearchMatch(retryCase, 'demo.passOnRetry')).toMatchObject({
      label: 'Step node',
    });
    expect(getCaseSearchMatch(retryCase, 'NODE_EXECUTION_ERROR')).toMatchObject(
      { label: 'Error code' },
    );
    expect(getCaseSearchMatch(retryCase, '无线耳机')).toMatchObject({
      label: 'Error message',
    });
    expect(getCaseSearchMatch(retryCase, 'data-product')).toMatchObject({
      label: 'Step input',
    });
    expect(getCaseSearchMatch(retryCase, 'execution-retry-1')).toMatchObject({
      label: 'Execution ID',
    });
    expect(getCaseSearchMatch(retryCase, 'not-present')).toBeUndefined();
  });

  it('indexes Agent screenshots as visual evidence for a Runner Attempt', () => {
    let reportReadCount = 0;
    const screenshots = Array.from({ length: 8 }, (_, index) => ({
      base64: `data:image/png;base64,visual-${index}`,
      capturedAt: Date.parse(at(5 + index)),
      sourceRef: { id: `screenshot-${index + 1}` },
    }));
    const report = {
      reportId: 'report-1',
      attributes: {
        playwright_test_description: '',
        playwright_test_id: 'test',
        playwright_test_title: 'test',
        playwright_test_status: 'passed',
        playwright_test_duration: 1_000,
      },
      get: () => {
        reportReadCount += 1;
        return {
          executions: [
            {
              id: 'execution-1',
              tasks: screenshots.map((screenshot, index) => ({
                type: 'Planning',
                taskId: `task-${index + 1}`,
                status: 'finished',
                uiContext: { screenshot },
              })),
            },
          ],
        };
      },
    } as unknown as PlaywrightTasks;
    const visualIndex = buildRunnerVisualIndex([report]);
    const visualAttempt = attempt('visual', 0, 'success', 5, 6, [
      step('prepare', 'success', { title: 'Prepare product data' }),
      step('aiAct', 'success', {
        title: 'Search for the prepared product',
        agentDetails: [{ reportId: 'report-1', executionId: 'execution-1' }],
      }),
    ]);

    expect(reportReadCount).toBe(0);
    const sampledFrames = getAttemptVisualFrames(visualAttempt, visualIndex);
    expect(sampledFrames).toHaveLength(6);
    expect(sampledFrames.at(0)).toMatchObject({
      reportId: 'report-1',
      executionId: 'execution-1',
      label: 'Planning',
      capturedAt: Date.parse(at(5)),
    });
    expect(sampledFrames.at(-1)?.capturedAt).toBe(Date.parse(at(12)));
    expect(getAllAttemptVisualFrames(visualAttempt, visualIndex)).toHaveLength(
      8,
    );

    expect(reportReadCount).toBe(1);
    getAttemptVisualFrames(visualAttempt, visualIndex);
    expect(reportReadCount).toBe(1);
  });

  it('links visual frames to Steps and positions them on the full Attempt clock', () => {
    const agentStep = step('aiAct', 'success', {
      startedAt: at(6),
      endedAt: at(8),
      agentDetails: [{ reportId: 'report-1', executionId: 'execution-1' }],
    });
    const customStep = step('verify', 'success', {
      startedAt: at(8),
      endedAt: at(9),
    });
    const visualAttempt = attempt(
      'attempt-with-timeline',
      0,
      'success',
      5,
      10,
      [agentStep, customStep],
    );
    const frames = [
      {
        key: 'frame-1',
        reportId: 'report-1',
        executionId: 'execution-1',
        label: 'Locate',
        capturedAt: Date.parse(at(6)),
        screenshot: { base64: 'data:image/png;base64,one' },
      },
      {
        key: 'frame-2',
        reportId: 'report-1',
        executionId: 'execution-1',
        label: 'Tap',
        capturedAt: Date.parse(at(9)),
        screenshot: { base64: 'data:image/png;base64,two' },
      },
    ];

    expect(getStepForVisualFrame(visualAttempt.steps, frames[0])).toBe(
      agentStep,
    );
    expect(getDefaultVisualFrameForStep(agentStep, frames)).toBe(frames[0]);
    expect(getDefaultVisualFrameForStep(customStep, frames)).toBeUndefined();
    expect(positionAttemptVisualFrames(visualAttempt, frames)).toMatchObject([
      { frame: frames[0], offsetMs: 1_000, offsetPercent: 20, stepId: 'aiAct' },
      { frame: frames[1], offsetMs: 4_000, offsetPercent: 80, stepId: 'aiAct' },
    ]);
  });
});
