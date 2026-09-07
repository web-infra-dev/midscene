import type {
  TestRunReportAttempt,
  TestRunReportDump,
  TestRunReportStep,
} from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlaywrightTasks } from '../../types';
import { CaseWorkspaceHeader } from './case-workspace-header';
import {
  buildRunnerTimeline,
  buildRunnerVisualIndex,
  filterAndSortRunnerProjectBreakdown,
  flattenRunnerCases,
  getAllAttemptVisualFrames,
  getAttemptVisualFrames,
  getAttemptVisualStory,
  getCaseSearchMatch,
  getCaseStory,
  getDefaultExpandedProjectKeys,
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
  status: TestRunReportStep['status'] = 'success',
  extra: Partial<TestRunReportStep> = {},
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

  it('filters and sorts the compact Project-to-Case breakdown', () => {
    const projects = groupRunnerProjects(dump);
    const emptyFailedProject = {
      ...projects[0],
      key: 'empty-project',
      project: {
        ...projects[0].project,
        projectId: 'empty-project',
        name: 'Empty failed project',
        documents: [],
      },
      cases: [],
      health: getRunnerHealth([]),
      passedCount: 0,
      failedCount: 0,
      retryPassedCount: 0,
      notRunCount: 0,
    };
    const projectsWithEmptyFailure = [...projects, emptyFailedProject];

    expect(
      filterAndSortRunnerProjectBreakdown(projects, {
        query: '',
        status: 'attention',
        sort: 'attention',
      })[0].cases.map((item) => item.status),
    ).toEqual(['failed', 'retry-passed', 'not-run']);

    expect(
      filterAndSortRunnerProjectBreakdown(projects, {
        query: 'NODE_EXECUTION_ERROR',
        status: 'all',
        sort: 'attention',
      })[0].cases.map((item) => item.testCase.caseId),
    ).toEqual(['retried']);

    expect(
      filterAndSortRunnerProjectBreakdown(projects, {
        query: '',
        status: 'all',
        sort: 'name',
      })[0].cases.map((item) => item.testCase.caseId),
    ).toEqual(['failed', 'not-run', 'passed', 'retried']);

    expect(
      filterAndSortRunnerProjectBreakdown(projectsWithEmptyFailure, {
        query: '',
        status: 'attention',
        sort: 'attention',
      }).map(({ item, cases }) => ({ name: item.project.name, cases })),
    ).toMatchObject([
      { name: 'Web', cases: expect.any(Array) },
      { name: 'Empty failed project', cases: [] },
    ]);
  });

  it('expands every failed Project and collapses all-passed Projects by default', () => {
    const [failedProject] = groupRunnerProjects(dump);
    const retryPassedProject = {
      ...failedProject,
      key: 'retry-passed-project',
      project: { ...failedProject.project, status: 'success' as const },
      failedCount: 0,
      retryPassedCount: 1,
    };
    const passedProject = {
      ...failedProject,
      key: 'passed-project',
      project: { ...failedProject.project, status: 'success' as const },
      failedCount: 0,
      retryPassedCount: 0,
    };
    const secondFailure = { ...failedProject, key: 'second-failure' };
    const setupFailure = {
      ...failedProject,
      key: 'setup-failure',
      failedCount: 0,
    };
    const views = [
      failedProject,
      retryPassedProject,
      passedProject,
      secondFailure,
      setupFailure,
    ].map((item) => ({ item, cases: item.cases }));

    expect([...getDefaultExpandedProjectKeys(views)]).toEqual([
      failedProject.key,
      secondFailure.key,
      setupFailure.key,
    ]);
  });

  it('opens a single-project single-case report directly in case detail', () => {
    const singleDump = structuredClone(dump);
    singleDump.projects[0].documents[0].cases = [
      singleDump.projects[0].documents[0].cases[0],
    ];
    const cases = flattenRunnerCases(singleDump);
    const projects = groupRunnerProjects(singleDump, cases);
    expect(resolveRunnerNavigation('', cases, projects)).toMatchObject({
      page: 'case',
      selectedCaseKey: cases[0].key,
      caseParent: 'overview',
    });
    expect(
      resolveRunnerNavigation('#runner-page=overview', cases, projects).page,
    ).toBe('case');
    expect(
      resolveRunnerNavigation(
        '#runner-page=project&runner-project=web',
        cases,
        projects,
      ).page,
    ).toBe('case');
    expect(
      resolveRunnerNavigation('', flattenRunnerCases(dump), projects).page,
    ).toBe('overview');
    expect(
      resolveRunnerNavigation('', cases, [
        ...projects,
        { ...projects[0], key: 'other' },
      ]).page,
    ).toBe('overview');
    expect(resolveRunnerNavigation('', [], projects).page).toBe('overview');
  });

  it('does not treat a filtered multi-case report as a standalone case', () => {
    const filteredCases = flattenRunnerCases(dump).slice(0, 1);
    const projects = groupRunnerProjects(dump, filteredCases);
    expect(isSingleCaseReport(projects)).toBe(false);
    expect(resolveRunnerNavigation('', filteredCases, projects).page).toBe(
      'overview',
    );
  });

  it('preserves single-case trace links and rejects unrelated step IDs', () => {
    const singleDump = structuredClone(dump);
    singleDump.projects[0].documents[0].cases = [
      singleDump.projects[0].documents[0].cases[1],
    ];
    const cases = flattenRunnerCases(singleDump);
    const projects = groupRunnerProjects(singleDump, cases);
    expect(
      resolveRunnerNavigation(
        '#runner-step=demo.passOnRetry&runner-trace=page',
        cases,
        projects,
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
      ),
    ).toMatchObject({
      page: 'case',
      deepLinkedStepId: undefined,
    });
  });

  it('hides standalone back navigation without losing run metrics or diagnostics', () => {
    const item = flattenRunnerCases(dump)[0];
    const props = {
      item,
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
    const standalone = renderToStaticMarkup(
      createElement(CaseWorkspaceHeader, { ...props, standaloneRun: run }),
    );
    expect(standalone).not.toContain('runner-back-button');
    expect(standalone).not.toContain('Copy case link');
    expect(standalone).not.toContain('runner-attempt-switcher');
    expect(standalone).toContain('run time');
    expect(standalone).toContain('model calls');
    expect(standalone).toContain('tokens');
    expect(standalone).toContain('Run failed');
    expect(standalone).toContain('Browser cleanup failed');
    expect(standalone).toContain('Trace unavailable');
    const regular = renderToStaticMarkup(
      createElement(CaseWorkspaceHeader, props),
    );
    expect(regular).toContain('runner-back-button');
    expect(regular).not.toContain('Copy case link');
    expect(regular).not.toContain('Run information');
  });

  it('shows a pass percentage matching the all-case fraction, including not-run cases', () => {
    const markup = renderToStaticMarkup(
      createElement(RunSummary, {
        dump,
        health: getRunnerHealth(flattenRunnerCases(dump)),
        totalCaseCount: 4,
        onReviewOutcome() {},
      }),
    );
    expect(markup).toContain(
      'aria-label="Percentage of all cases passed">50%</span>',
    );
    expect(markup).not.toContain('runner-overview-outcome-message');
    expect(markup).toContain('Review 1 failed case');
  });

  it('does not invent a pass percentage for an empty run', () => {
    const markup = renderToStaticMarkup(
      createElement(RunSummary, {
        dump: { ...dump, summary: { ...dump.summary, passed: 0, total: 0 } },
        health: getRunnerHealth([]),
        totalCaseCount: 0,
        onReviewOutcome() {},
      }),
    );
    expect(markup).toContain(
      'aria-label="Percentage of all cases passed">—</span>',
    );
    expect(markup).not.toContain('NaN');
  });

  it('keeps attempt comparison in standalone reports with retries', () => {
    const item = flattenRunnerCases(dump)[1];
    const markup = renderToStaticMarkup(
      createElement(CaseWorkspaceHeader, {
        item,
        standaloneRun: dump,
        selectedAttempt: item.finalAttempt,
        backLabel: 'Overview',
        onBack() {},
        onSelectAttempt() {},
      }),
    );
    expect(markup).not.toContain('runner-back-button');
    expect(markup).toContain('Attempt 1');
    expect(markup).toContain('Attempt 2');
    expect(markup).not.toContain('Original failure');
    expect(markup).not.toContain('Final result');
    expect(markup).not.toContain('· failed');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('preserves step deep links when choosing the initial page', () => {
    const cases = flattenRunnerCases(dump);
    const projects = groupRunnerProjects(dump, cases);
    const target = cases.find((item) => item.finalAttempt?.steps.length);
    if (!target?.finalAttempt) throw new Error('Fixture needs a step');
    const stepId = target.finalAttempt.steps[0].id;
    expect(
      resolveRunnerNavigation(
        `#runner-step=${encodeURIComponent(stepId)}`,
        cases,
        projects,
      ),
    ).toMatchObject({
      page: 'case',
      selectedCaseKey: target.key,
      deepLinkedStepId: stepId,
    });
  });

  it('uses the same filters within a single project without changing its health', () => {
    const projects = groupRunnerProjects(dump, flattenRunnerCases(dump));
    const selected = projects[0];
    const originalCount = selected.cases.length;
    const matches = filterAndSortRunnerProjectBreakdown([selected], {
      query: 'NODE_EXECUTION_ERROR',
      status: 'retry-passed',
      sort: 'duration',
    });
    expect(matches[0].cases.map((item) => item.testCase.caseId)).toEqual([
      'retried',
    ]);
    expect(matches[0].item).toBe(selected);
    expect(selected.cases).toHaveLength(originalCount);
    expect(
      filterAndSortRunnerProjectBreakdown([selected], {
        query: 'no-such-case',
        status: 'all',
        sort: 'name',
      }),
    ).toEqual([]);
  });

  it('builds a compact semantic story from the final Attempt', () => {
    const retryCase = dump.projects[0].documents[0].cases[1];
    expect(getCaseStory(retryCase)).toEqual([
      'Search for headphones',
      'Verify the result list',
    ]);
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

  it('keeps setup and teardown time visible around case execution', () => {
    const [runnerLane, projectLane] = buildRunnerTimeline(dump);
    expect(runnerLane.segments).toMatchObject([
      { label: 'Preflight', durationMs: 1_000 },
      { label: 'Projects running', durationMs: 8_000 },
      { label: 'Finalize results', durationMs: 1_000 },
    ]);
    expect(projectLane.segments).toMatchObject([
      {
        kind: 'setup',
        durationMs: 2_000,
        offsetPercent: 10,
        widthPercent: 20,
      },
      {
        kind: 'test',
        durationMs: 5_000,
        offsetPercent: 30,
        widthPercent: 50,
      },
      {
        kind: 'teardown',
        durationMs: 1_000,
        offsetPercent: 80,
        widthPercent: 10,
      },
    ]);
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
    expect(getAttemptVisualStory(visualAttempt, visualIndex)).toMatchObject([
      {
        label: 'Prepare product data',
        frame: undefined,
      },
      {
        label: 'Search for the prepared product',
        frame: {
          reportId: 'report-1',
          executionId: 'execution-1',
          label: 'Planning',
        },
      },
    ]);
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
