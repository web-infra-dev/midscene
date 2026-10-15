import type {
  TestRunReportDocument,
  TestRunReportDocumentPlan,
  TestRunReportDump,
} from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestReportFixture } from '../../../e2e/fixtures/test-report.mjs';
import { buildRunnerVisualIndex, flattenRunnerCases } from './model';
import {
  type OverviewFilters,
  buildOverviewProjects,
  changeOverviewSort,
  createOverviewState,
  fileDisplayName,
  filterOverviewProjects,
  getOverviewCaseSummary,
  getOverviewProjectSort,
  getOverviewProjectStatus,
  getOverviewProjectSummary,
  getOverviewStatusCounts,
  getSelectedOverviewProject,
  groupOverviewProjects,
  selectOverviewProject,
  toggleOverviewFiles,
  toggleOverviewStatus,
} from './overview-model';
import { ProjectBreakdownTree } from './project-breakdown';
import { ProjectNavigation } from './project-navigation';

const source = {
  sources: [
    {
      reportId: 'report',
      executionIds: ['execution'],
      scopeId: 'scope',
      sourcePath: 'agent.html',
    },
  ],
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
};
const fixture = () => createTestReportFixture(source) as TestRunReportDump;
const options: OverviewFilters = {
  query: '',
  statuses: [],
  projectSorts: new Map(),
};
const plan = (
  documentId: string,
  sourcePath = `${documentId}.yaml`,
): TestRunReportDocumentPlan => ({
  documentId,
  sourcePath,
  retry: { scope: 'case', count: 0 },
  beforeAll: [],
  afterAll: [],
  cases: [],
});

describe('Detailed Case summaries', () => {
  it('shows the primary failure reason and the owning Step', () => {
    const dump = fixture();
    const testCase = dump.projects[0].documents[0].cases[0];
    testCase.status = 'failed';
    const attempt = testCase.attempts.at(-1)!;
    attempt.status = 'failed';
    attempt.steps[0].status = 'failed';
    attempt.steps[0].error = {
      name: 'Error',
      code: 'NODE_EXECUTION_ERROR',
      message: 'Node execution failed',
      cause: {
        name: 'AssertionError',
        message: 'Expected cart count 1, received 0',
      },
    };
    const summary = getOverviewCaseSummary(flattenRunnerCases(dump)[0]);
    expect(summary).toMatchObject({
      message: 'Expected cart count 1, received 0',
      tone: 'danger',
      stepId: attempt.steps[0].id,
    });
    expect(summary?.label).toContain(attempt.steps[0].node);
  });

  it('identifies recovered errors as an earlier attempt rather than a current failure', () => {
    const item = flattenRunnerCases(fixture())[0];
    expect(getOverviewCaseSummary(item)).toMatchObject({
      label: 'Earlier attempt · order.create',
      message: 'Inventory was not ready.',
      tone: 'warning',
      stepId: 'attempt-1:steps:0',
    });
  });

  it('shows a final cleanup error instead of a recovered Step failure', () => {
    const dump = fixture();
    const testCase = dump.projects[0].documents[0].cases[0];
    testCase.status = 'failed';
    const attempt = testCase.attempts.at(-1)!;
    attempt.status = 'failed';
    attempt.hostErrors = [
      {
        phase: 'cleanup',
        error: { name: 'Error', message: 'Browser disposal failed' },
      },
    ];
    expect(getOverviewCaseSummary(flattenRunnerCases(dump)[0])).toMatchObject({
      label: 'Case failed',
      message: 'Browser disposal failed',
      tone: 'danger',
      stepId: undefined,
    });
  });

  it('includes a not-run reason without inventing a failure for passing Cases', () => {
    const item = flattenRunnerCases(fixture())[1];
    expect(getOverviewCaseSummary(item)).toBeUndefined();
    expect(
      getOverviewCaseSummary({
        ...item,
        status: 'not-run',
        testCase: {
          ...item.testCase,
          notRunReason: 'Blocked by document setup',
        },
      }),
    ).toMatchObject({
      message: 'Blocked by document setup',
      tone: 'muted',
    });
  });
});
const extraFile = (
  documentId: string,
  sourcePath = `${documentId}.yaml`,
  durationMs?: number,
): TestRunReportDocument => ({
  documentId,
  sourcePath,
  status: 'success',
  beforeAll: [],
  afterAll: [],
  cases: [],
  durationMs,
});
const projectsFor = (dump: TestRunReportDump) =>
  buildOverviewProjects(dump, flattenRunnerCases(dump));

describe('Project → File → Case overview', () => {
  it('does not mistake an aggregate failed Project status for an independent Project error', () => {
    const dump = fixture();
    const project = dump.projects[0];
    project.status = 'failed';
    project.lifecycle!.status = 'failed';
    project.documents[0].status = 'failed';
    project.documents[0].cases[0].status = 'failed';
    project.documents[0].cases.push({
      caseId: 'bail',
      name: 'Bailed',
      caseIndex: 2,
      status: 'not-run',
      notRunReason: 'bail',
      attempts: [],
    });
    const projects = projectsFor(dump);
    expect(projects[0].hasScopeError).toBe(false);
    const result = filterOverviewProjects(projects, {
      ...options,
      statuses: ['failed'],
    });
    expect(result[0].files[0].cases.map((item) => item.status)).toEqual([
      'failed',
    ]);
    expect(projects[0].issues).toEqual([]);
  });

  it('recovers missing selected Case definitions from an existing failed file plan without mutating the dump', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.status = 'failed';
    const documentPlan = plan(document.documentId, document.sourcePath);
    documentPlan.cases.push({
      caseId: 'never-started',
      name: 'Never started',
      caseIndex: 9,
      selected: true,
      tags: [],
      beforeEach: [],
      steps: [],
      afterEach: [],
    });
    document.plan = documentPlan;
    const cases = flattenRunnerCases(dump);
    expect(cases.at(-1)).toMatchObject({
      status: 'not-run',
      testCase: { name: 'Never started', attempts: [] },
    });
    expect(document.cases).toHaveLength(2);
    expect(projectsFor(dump)[0].files[0].totalCaseCount).toBe(3);
  });

  it('marks a recovered File retry independently while keeping every always-passing Case out of Retried', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.cases = [document.cases[1]];
    const { cases: _cases, ...attempt } = document;
    document.attempts = [
      { ...attempt, status: 'failed', attemptIndex: 0 },
      { ...attempt, status: 'success', attemptIndex: 1 },
    ];
    const projects = projectsFor(dump);
    expect(projects[0].files[0]).toMatchObject({
      status: 'retry-passed',
      retryCount: 1,
      retryPassedCount: 0,
    });
    expect(
      createOverviewState(projects).expandedFileKeys.has(
        projects[0].files[0].key,
      ),
    ).toBe(true);
    expect(
      filterOverviewProjects(projects, {
        ...options,
        statuses: ['retry-passed'],
      }),
    ).toEqual([]);
  });

  it('sums recorded Case attempt durations while retaining the File wall-clock duration', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.cases[0].attempts[1].startedAt = '2026-08-20T08:01:00.000Z';
    document.cases[0].attempts[1].endedAt = '2026-08-20T08:01:03.000Z';
    document.cases[0].attempts[1].durationMs = 3000;
    const project = projectsFor(dump)[0];
    expect(project.cases[0].durationMs).toBe(4000);
    expect(project.files[0].durationMs).toBe(5000);
  });

  it('follows Markdown document order, then appends plan-only files and collection errors', () => {
    const dump = fixture();
    const project = dump.projects[0];
    project.documents.push(extraFile('empty', 'different/checkout.yaml'));
    project.plans = [
      plan('unexecuted'),
      plan('empty', 'different/checkout.yaml'),
      plan('checkout-document', 'checkout.yaml'),
    ];
    project.collectionErrors = [
      {
        sourcePath: 'broken.yaml',
        error: { name: 'ParseError', message: 'Unclosed mapping' },
      },
    ];
    const [view] = projectsFor(dump);
    expect(view.files.map((file) => file.sourcePath)).toEqual([
      'checkout.yaml',
      'different/checkout.yaml',
      'unexecuted.yaml',
      'broken.yaml',
    ]);
    expect(view.files.map((file) => file.totalCaseCount)).toEqual([
      2,
      0,
      0,
      undefined,
    ]);
    expect(view.files.at(-1)).toMatchObject({
      hasScopeError: true,
      status: 'failed',
      issues: [
        { message: 'Unclosed mapping', title: 'File collection failed' },
      ],
    });
    expect(view.issues).toEqual([]);
  });

  it('retains planned not-run cases and their original route identities', () => {
    const dump = fixture();
    const planned = plan('planned');
    planned.cases = [
      {
        caseId: 'planned-case',
        name: 'Planned case',
        caseIndex: 2,
        selected: true,
        tags: [],
        beforeEach: [],
        steps: [],
        afterEach: [],
      },
      {
        caseId: 'filtered-out',
        name: 'Filtered',
        caseIndex: 3,
        selected: false,
        tags: [],
        beforeEach: [],
        steps: [],
        afterEach: [],
      },
    ];
    dump.projects[0].plans = [planned];
    dump.projects[0].lifecycle!.setupError = {
      name: 'Error',
      message: 'Browser unavailable',
    };
    const cases = flattenRunnerCases(dump);
    expect(
      cases.find((item) => item.testCase.caseId === 'planned-case'),
    ).toMatchObject({
      key: 'web-demo:planned:planned-case',
      status: 'not-run',
      testCase: { notRunReason: 'project-setup-failed', attempts: [] },
    });
    expect(cases.some((item) => item.testCase.caseId === 'filtered-out')).toBe(
      false,
    );
    const result = filterOverviewProjects(projectsFor(dump), {
      ...options,
      statuses: ['failed'],
    });
    expect(
      result[0].files
        .flatMap((file) => file.cases)
        .map((item) => item.testCase.caseId),
    ).toEqual(['planned-case']);
  });

  it('keeps independent calls and cross-project files isolated even at the same source path', () => {
    const dump = fixture();
    const original = dump.projects[0].documents[0];
    dump.projects[0].documents.push({
      ...original,
      documentId: 'checkout-document:second-run',
      logicalDocumentId: original.documentId,
      documentRunId: 'second-run',
    });
    const second = structuredClone(dump.projects[0]);
    second.projectId = 'second-project';
    dump.projects.push(second);
    const projects = projectsFor(dump);
    expect(projects.map((item) => item.files.length)).toEqual([2, 2]);
    expect(
      new Set(projects.flatMap((item) => item.files.map((file) => file.key)))
        .size,
    ).toBe(4);
    dump.projects[0].collectionErrors = [
      {
        sourcePath: original.sourcePath,
        error: { name: 'Error', message: 'Ambiguous collection failure' },
      },
    ];
    expect(projectsFor(dump)[0].files).toHaveLength(3);
  });

  it('counts file retries separately from Cases that actually recovered from failure', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.attemptIndex = 1;
    for (const item of document.cases) {
      item.attempts = [structuredClone(item.attempts.at(-1)!)];
      item.attempts[0].attemptIndex = 1;
    }
    const cases = flattenRunnerCases(dump);
    expect(cases.map((item) => item.status)).toEqual(['passed', 'passed']);
    const [project] = projectsFor(dump);
    expect(project.files[0]).toMatchObject({
      retryCount: 1,
      retryPassedCount: 0,
      passedCount: 2,
    });
    expect(getOverviewStatusCounts([project], '')).toEqual({
      all: 2,
      failed: 0,
      'retry-passed': 0,
      passed: 2,
    });
  });

  it('shows file cleanup failure with 100% Case pass rate and zero Failed Cases', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.status = 'failed';
    document.teardownErrors = [{ name: 'Error', message: 'Dispose failed' }];
    const projects = projectsFor(dump);
    expect(projects[0].files[0]).toMatchObject({
      passedCount: 2,
      totalCaseCount: 2,
      hasScopeError: true,
      status: 'failed',
    });
    const result = filterOverviewProjects(projects, {
      ...options,
      statuses: ['failed'],
    });
    expect(result[0].files[0].cases).toEqual([]);
    expect(result[0].files[0].item.issues[0].message).toBe('Dispose failed');
    expect(getOverviewStatusCounts(projects, '').failed).toBe(0);
  });

  it('keeps collection errors visible without inventing Cases or a 100% pass rate', () => {
    const dump = fixture();
    dump.projects[0].documents = [];
    dump.projects[0].collectionErrors = [
      {
        sourcePath: 'bad.yaml',
        error: { name: 'Error', message: 'Cannot parse YAML' },
      },
    ];
    const projects = projectsFor(dump);
    const result = filterOverviewProjects(projects, {
      ...options,
      statuses: ['failed'],
      query: 'parse',
    });
    expect(result).toHaveLength(1);
    expect(result[0].files[0].cases).toEqual([]);
    expect(result[0].files[0].item.totalCaseCount).toBeUndefined();
    expect(getOverviewStatusCounts(projects, 'parse').all).toBe(0);
  });

  it('preserves Not run context under failed file scopes but does not count it as Failed', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.status = 'failed';
    document.hostErrors = [
      {
        phase: 'setup',
        error: { name: 'Error', message: 'Device offline' },
      },
    ];
    document.cases[0].status = 'not-run';
    document.cases[0].attempts = [];
    const projects = projectsFor(dump);
    const result = filterOverviewProjects(projects, {
      ...options,
      statuses: ['failed'],
    });
    expect(result[0].files[0].cases.map((item) => item.status)).toEqual([
      'not-run',
    ]);
    const counts = getOverviewStatusCounts(projects, '');
    expect(counts.failed).toBe(0);
    expect(counts.all).toBe(counts.passed + counts['retry-passed'] + 1);
  });

  it('implements mutually exclusive All and OR status filters without an empty state', () => {
    expect(toggleOverviewStatus([], 'all')).toEqual([]);
    const failed = toggleOverviewStatus([], 'failed');
    const both = toggleOverviewStatus(failed, 'passed');
    expect(both).toEqual(['failed', 'passed']);
    expect(toggleOverviewStatus(both, 'all')).toEqual([]);
    expect(toggleOverviewStatus(failed, 'failed')).toEqual([]);
    const allThree = toggleOverviewStatus(both, 'retry-passed');
    expect(allThree).toHaveLength(3);
    const dump = fixture();
    dump.projects[0].documents[0].cases.push({
      caseId: 'not-run',
      name: 'Skipped',
      caseIndex: 2,
      status: 'not-run',
      attempts: [],
    });
    expect(
      filterOverviewProjects(projectsFor(dump), {
        ...options,
        statuses: allThree,
      })[0].files[0].cases,
    ).toHaveLength(2);
  });

  it('combines search and status, matches parents/errors, and leaves full-file rates unchanged', () => {
    const projects = projectsFor(fixture());
    const query = filterOverviewProjects(projects, {
      ...options,
      query: 'Web regression',
      statuses: ['passed'],
    });
    expect(query[0].files[0].cases.map((item) => item.testCase.name)).toEqual([
      'Verify cart summary',
    ]);
    expect(query[0].files[0].item).toBe(projects[0].files[0]);
    expect(query[0].files[0].item.passedCount).toBe(2);
    const retry = filterOverviewProjects(projects, {
      ...options,
      query: 'Inventory',
      statuses: ['retry-passed'],
    });
    expect(retry[0].files[0].cases[0].testCase.name).toBe(
      'Checkout with retry',
    );
    expect(
      filterOverviewProjects(projects, {
        ...options,
        query: 'checkout.yaml',
        statuses: ['passed'],
      })[0].files[0].cases,
    ).toHaveLength(1);
    expect(
      filterOverviewProjects(projects, { ...options, query: 'missing query' }),
    ).toEqual([]);
    expect(getOverviewStatusCounts(projects, 'Inventory')).toEqual({
      all: 1,
      failed: 0,
      'retry-passed': 1,
      passed: 0,
    });
  });

  it('sorts each Project independently and matches Markdown document order', () => {
    const dump = fixture();
    const project = dump.projects[0];
    project.documents.push(extraFile('z-first', 'z.yaml', 200));
    project.plans = [
      plan('z-first', 'z.yaml'),
      plan('checkout-document', 'checkout.yaml'),
    ];
    project.documents[0].cases.reverse();
    const second = structuredClone(project);
    second.projectId = 'alpha';
    second.name = 'Alpha';
    dump.projects.push(second);
    const projects = projectsFor(dump);
    const before = project.documents[0].cases.map((item) => item.caseId);
    const byDuration = filterOverviewProjects(projects, {
      ...options,
      projectSorts: new Map([
        [projects[0].key, { sort: 'duration', direction: 'desc' }],
      ]),
    });
    expect(byDuration.map((item) => item.item.project.name)).toEqual([
      'Web regression',
      'Alpha',
    ]);
    expect(byDuration[0].files.map((file) => file.item.sourcePath)).toEqual([
      'checkout.yaml',
      'z.yaml',
    ]);
    const reportOrder = filterOverviewProjects(projects, options);
    expect(reportOrder[0].files.map((file) => file.item.sourcePath)).toEqual([
      'checkout.yaml',
      'z.yaml',
    ]);
    const reverseReportOrder = filterOverviewProjects(projects, {
      ...options,
      projectSorts: new Map([
        [projects[0].key, { sort: 'file', direction: 'desc' }],
      ]),
    });
    expect(
      reverseReportOrder[0].files.map((file) => file.item.sourcePath),
    ).toEqual(['z.yaml', 'checkout.yaml']);
    expect(
      reverseReportOrder[0].files[1].cases.map(
        (item) => item.testCase.caseIndex,
      ),
    ).toEqual([0, 1]);
    expect(project.documents[0].cases.map((item) => item.caseId)).toEqual(
      before,
    );
    const state = createOverviewState(projects);
    const duration = changeOverviewSort(state, projects[0].key, 'duration');
    expect(getOverviewProjectSort(duration, projects[0].key)).toEqual({
      sort: 'duration',
      direction: 'desc',
    });
    expect(
      getOverviewProjectSort(
        changeOverviewSort(duration, projects[0].key, 'duration'),
        projects[0].key,
      ).direction,
    ).toBe('asc');
    expect(getOverviewProjectSort(duration, projects[1].key)).toEqual({
      sort: 'file',
      direction: 'asc',
    });
    const independentlySorted = filterOverviewProjects(
      projects,
      changeOverviewSort(state, projects[0].key, 'file'),
    );
    expect(
      independentlySorted[0].files.map((file) => file.item.sourcePath),
    ).toEqual(['z.yaml', 'checkout.yaml']);
    expect(
      independentlySorted[1].files.map((file) => file.item.sourcePath),
    ).toEqual(['checkout.yaml', 'z.yaml']);
    expect(state.projectSorts.size).toBe(0);
  });

  it.each(['asc', 'desc'] as const)(
    'places unknown durations and rates last in %s order, retaining zero durations',
    (direction) => {
      const dump = fixture();
      dump.projects[0].documents.push(
        extraFile('unknown'),
        extraFile('zero', 'zero.yaml', 0),
      );
      const projects = projectsFor(dump);
      expect(
        filterOverviewProjects(projects, {
          ...options,
          projectSorts: new Map([
            [projects[0].key, { sort: 'duration', direction }],
          ]),
        })[0].files.at(-1)!.item.sourcePath,
      ).toBe('unknown.yaml');
      const byRate = filterOverviewProjects(projects, {
        ...options,
        projectSorts: new Map([
          [projects[0].key, { sort: 'passed-rate', direction }],
        ]),
      })[0].files;
      expect(byRate[0].item.sourcePath).toBe('checkout.yaml');
      expect(byRate.map((file) => file.item.sourcePath)).toEqual([
        'checkout.yaml',
        'unknown.yaml',
        'zero.yaml',
      ]);
    },
  );

  it('keeps Case pass-rate ties in definition order and Attention ranks distinct outcomes', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.cases.reverse();
    document.cases.push(
      {
        caseId: 'pending',
        name: 'Pending',
        caseIndex: 3,
        status: 'not-run',
        attempts: [],
      },
      {
        caseId: 'failed',
        name: 'Failed',
        caseIndex: 2,
        status: 'failed',
        attempts: [],
      },
    );
    const projects = projectsFor(dump);
    expect(
      filterOverviewProjects(projects, {
        ...options,
        projectSorts: new Map([
          [projects[0].key, { sort: 'passed-rate', direction: 'desc' }],
        ]),
      })[0].files[0].cases.map((item) => item.status),
    ).toEqual(['retry-passed', 'passed', 'failed', 'not-run']);
    expect(
      filterOverviewProjects(projects, {
        ...options,
        projectSorts: new Map([
          [projects[0].key, { sort: 'result', direction: 'asc' }],
        ]),
      })[0].files[0].cases.map((item) => item.status),
    ).toEqual(['failed', 'not-run', 'retry-passed', 'passed']);
    expect(
      filterOverviewProjects(projects, {
        ...options,
        projectSorts: new Map([
          [projects[0].key, { sort: 'result', direction: 'desc' }],
        ]),
      })[0].files[0].cases.map((item) => item.status),
    ).toEqual(['passed', 'retry-passed', 'not-run', 'failed']);
  });

  it('keeps inline YAML and Agent-only source reports honest', () => {
    const dump = fixture();
    dump.projects[0].documents[0].sourcePath = '<inline-yaml>';
    expect(fileDisplayName(projectsFor(dump)[0].files[0])).toBe('Inline YAML');
    const document = dump.projects[0].documents[0];
    document.documentId = 'source-1:agent-report';
    document.sourcePath = '/reports/original.html';
    document.scopeReportIds = ['report'];
    expect(projectsFor(dump)[0].files[0].sourceKind).toBe('agent');
  });

  it.each(['compact', 'detailed'] as const)(
    'renders aligned semantic tables with identical %s Case sets and scoped file errors',
    (displayMode) => {
      const dump = fixture();
      dump.projects[0].collectionErrors = [
        {
          sourcePath: 'broken.yaml',
          error: { name: 'Error', message: 'Bad YAML' },
        },
      ];
      const projects = projectsFor(dump);
      const state = createOverviewState(projects);
      const html = renderToStaticMarkup(
        <ProjectBreakdownTree
          projects={filterOverviewProjects(projects, state)}
          visualIndex={buildRunnerVisualIndex([])}
          caseDisplayMode={displayMode}
          expandedFileKeys={state.expandedFileKeys}
          projectSorts={state.projectSorts}
          query=""
          onSortChange={() => {}}
          onToggleFile={() => {}}
          hasActiveFilters={false}
          onResetFilters={() => {}}
          onOpenCase={() => {}}
        />,
      );
      expect(html.match(/data-case-key=/g)).toHaveLength(2);
      expect(html).toContain('<table');
      expect(html).toContain('<colgroup>');
      expect(html).toContain('aria-sort="ascending"');
      expect(html).toContain('Sort by Files');
      expect(html).toContain('Passed / Case');
      expect(html).toContain('Bad YAML');
      expect(html).not.toContain('0 / 0');
      expect(html.match(/title="checkout.yaml"/g)).toHaveLength(1);
      expect(html.includes('variant="overview"')).toBe(false);
      expect(html.includes('runner-case-evidence-row')).toBe(
        displayMode === 'detailed',
      );
    },
  );

  it('keeps filtered rows concise without percentages, file match notes or Case error summaries', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    const testCase = document.cases[0];
    document.status = 'failed';
    testCase.status = 'failed';
    const attempt = testCase.attempts.at(-1)!;
    attempt.status = 'failed';
    attempt.steps[0].status = 'failed';
    attempt.steps[0].error = {
      name: 'Error',
      message: 'Detailed failure belongs in the Case inspector',
    };
    const projects = projectsFor(dump);
    const state = {
      ...createOverviewState(projects),
      statuses: ['failed'] as const,
    };
    const html = renderToStaticMarkup(
      <ProjectBreakdownTree
        projects={filterOverviewProjects(projects, state)}
        visualIndex={buildRunnerVisualIndex([])}
        caseDisplayMode="compact"
        expandedFileKeys={state.expandedFileKeys}
        projectSorts={
          new Map([[projects[0].key, { sort: 'result', direction: 'asc' }]])
        }
        query=""
        onSortChange={() => {}}
        onToggleFile={() => {}}
        hasActiveFilters
        onResetFilters={() => {}}
        onOpenCase={() => {}}
      />,
    );
    expect(html.match(/data-case-key=/g)).toHaveLength(1);
    expect(html).toContain('at the failed Step');
    expect(html).toContain('Passed / Case');
    expect(html).toContain('runner-file-case-total');
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain('matching of');
    expect(html).not.toContain(
      'Detailed failure belongs in the Case inspector',
    );
    const sortIcons = html.match(
      /<span class="runner-file-sort-icon[\s\S]*?<\/button>/g,
    )!;
    expect(sortIcons).toHaveLength(4);
    expect(
      sortIcons
        .slice(1)
        .every(
          (icon) => icon.includes('caret-up') && icon.includes('caret-down'),
        ),
    ).toBe(true);
  });
});

describe('overview project navigation', () => {
  it('includes every nonzero outcome without counting retried Cases twice', () => {
    const base = projectsFor(fixture())[0];
    const mixed = {
      ...base,
      cases: Array.from({ length: 6 }, () => base.cases[0]),
      passedCount: 3,
      retryPassedCount: 1,
      failedCount: 2,
      notRunCount: 1,
    };
    expect(getOverviewProjectSummary(mixed)).toBe(
      '6 cases · 2 passed · 1 retried · 2 failed · 1 not run',
    );
    const html = renderToStaticMarkup(
      <ProjectNavigation
        projects={[mixed, { ...mixed, key: 'another-project' }]}
        collapsedGroups={new Set()}
        onSelect={() => {}}
        onToggleGroup={() => {}}
      />,
    );
    expect(
      html.match(
        /title="6 cases · 2 passed · 1 retried · 2 failed · 1 not run"/g,
      ),
    ).toHaveLength(2);
    expect(html).toContain(`aria-describedby="project-summary-${mixed.key}"`);
    expect(html).toContain('id="project-summary-another-project"');
  });

  it('omits zero outcomes and keeps Case totals for empty or wholly not-run Projects', () => {
    const base = projectsFor(fixture())[0];
    const empty = {
      ...base,
      cases: [],
      passedCount: 0,
      retryPassedCount: 0,
      failedCount: 0,
      notRunCount: 0,
    };
    expect(getOverviewProjectSummary(empty)).toBe('0 cases');
    expect(
      getOverviewProjectSummary({
        ...empty,
        cases: base.cases,
        notRunCount: base.cases.length,
      }),
    ).toBe(`${base.cases.length} cases · ${base.cases.length} not run`);
    expect(
      getOverviewProjectSummary({
        ...empty,
        cases: base.cases,
        passedCount: base.cases.length,
        retryPassedCount: base.cases.length,
      }),
    ).toBe(`${base.cases.length} cases · ${base.cases.length} retried`);
  });

  it('groups failed, retried, passed and not-run projects in that order without losing their identities', () => {
    const base = projectsFor(fixture())[0];
    const project = (key: string, changes = {}) => ({
      ...base,
      key,
      failedCount: 0,
      retryPassedCount: 0,
      notRunCount: 0,
      hasScopeError: false,
      ...changes,
    });
    const projects = [
      project('passed'),
      project('retried', { retryPassedCount: 1 }),
      project('failed', { hasScopeError: true }),
      project('not-run', { notRunCount: 1 }),
    ];
    expect(
      groupOverviewProjects(projects).map((group) => [
        group.status,
        group.projects.map((item) => item.key),
      ]),
    ).toEqual([
      ['failed', ['failed']],
      ['retry-passed', ['retried']],
      ['passed', ['passed']],
      ['not-run', ['not-run']],
    ]);
    expect(getSelectedOverviewProject(projects)?.key).toBe('failed');
    expect(
      getSelectedOverviewProject(
        projects.filter((item) => item.key !== 'failed'),
      )?.key,
    ).toBe('retried');
    expect(getSelectedOverviewProject(projects, 'passed')?.key).toBe('passed');
    expect(getSelectedOverviewProject(projects, 'missing')?.key).toBe('failed');
    expect(getSelectedOverviewProject([])).toBeUndefined();
  });

  it('shows matching Project counts beside each navigation group instead of the module title', () => {
    const base = projectsFor(fixture())[0];
    const project = (key: string, changes = {}) => ({
      ...base,
      key,
      failedCount: 0,
      retryPassedCount: 0,
      notRunCount: 0,
      hasScopeError: false,
      ...changes,
    });
    const html = renderToStaticMarkup(
      <ProjectNavigation
        projects={[
          project('passed-1'),
          project('retried', { retryPassedCount: 1 }),
          project('failed', { hasScopeError: true }),
          project('passed-2'),
        ]}
        selectedKey="failed"
        collapsedGroups={new Set()}
        onSelect={() => {}}
        onToggleGroup={() => {}}
      />,
    );
    expect(html).toContain('<h2>Projects</h2>');
    for (const [label, count] of [
      ['Failed', 1],
      ['Passed after retry', 1],
      ['Passed', 2],
    ]) {
      expect(html).toContain(`<span>${label}</span><span>${count}</span>`);
      expect(html).toContain(`Collapse ${label} projects (${count})`);
    }
    expect(html.indexOf('Collapse Failed projects (1)')).toBeLessThan(
      html.indexOf('Collapse Passed after retry projects (1)'),
    );
    expect(
      html.indexOf('Collapse Passed after retry projects (1)'),
    ).toBeLessThan(html.indexOf('Collapse Passed projects (2)'));
  });

  it('keeps a project with only file errors in the Failed navigation group', () => {
    const base = projectsFor(fixture())[0];
    const project = {
      ...base,
      failedCount: 0,
      notRunCount: 0,
      retryPassedCount: 0,
      files: base.files.map((file) => ({ ...file, hasScopeError: true })),
    };
    expect(getOverviewProjectStatus(project)).toBe('failed');
  });

  it('changes the selected project without carrying a different project’s status filter or resetting sorts', () => {
    const projects = projectsFor(fixture());
    const initial = changeOverviewSort(
      createOverviewState(projects),
      projects[0].key,
      'duration',
    );
    const next = selectOverviewProject(
      { ...initial, statuses: ['failed'] },
      'another-project',
    );
    expect(next.selectedProjectKey).toBe('another-project');
    expect(next.statuses).toEqual([]);
    expect(next.projectSorts).toBe(initial.projectSorts);
    expect(next.expandedFileKeys).toBe(initial.expandedFileKeys);
  });
});

describe('visible File expansion', () => {
  it('collapses all visible Files while preserving hidden Files and other Projects', () => {
    const initial = new Set(['web:a', 'web:b', 'web:hidden', 'mobile:a']);
    expect(toggleOverviewFiles(initial, ['web:a', 'web:b'])).toEqual(
      new Set(['web:hidden', 'mobile:a']),
    );
    expect(initial.size).toBe(4);
  });

  it('expands all visible Files when the visible set is partially expanded', () => {
    const initial = new Set(['web:a', 'mobile:a']);
    expect(toggleOverviewFiles(initial, ['web:a', 'web:b'])).toEqual(
      new Set(['web:a', 'web:b', 'mobile:a']),
    );
  });

  it('preserves expansion for an empty result and supports expanding a fully collapsed set', () => {
    const initial = new Set(['mobile:a']);
    expect(toggleOverviewFiles(initial, [])).toEqual(initial);
    expect(toggleOverviewFiles(initial, ['web:a', 'web:b'])).toEqual(
      new Set(['mobile:a', 'web:a', 'web:b']),
    );
  });
});
