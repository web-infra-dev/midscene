import type { TestRunReportDump } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlaywrightTasks } from '../../types';
import { CaseWorkspace } from './case-workspace';
import { getIssuePresentation } from './issue-presentation';
import {
  collectReportIssues,
  getCaseIssues,
  getProjectIssues,
  getRunIssues,
  getStepIssues,
} from './issues';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getRunnerHealth,
  groupRunnerProjects,
} from './model';
import { RunOverview } from './run-overview';

const time = {
  startedAt: '2026-10-10T00:00:00Z',
  endedAt: '2026-10-10T00:00:01Z',
  durationMs: 1000,
};
const fixture = (): TestRunReportDump => ({
  schemaVersion: 1,
  kind: 'test-runner',
  runId: 'run',
  status: 'success',
  ...time,
  summary: {
    total: 4,
    passed: 4,
    failed: 0,
    notRun: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  },
  metrics: {
    modelCallCount: 4,
    modelTimeMs: 400,
    promptTokens: 20,
    cachedInputTokens: 0,
    completionTokens: 20,
    totalTokens: 40,
    collection: {
      status: 'complete',
      expectedExecutionCount: 4,
      capturedExecutionCount: 4,
      reasons: [],
    },
  },
  projects: ['one', 'two'].map((projectId) => ({
    projectId,
    name: projectId,
    status: 'success',
    retry: 0,
    collectionErrors: [],
    documents: [
      {
        documentId: `${projectId}:document`,
        sourcePath: `${projectId}.yaml`,
        status: 'success',
        beforeAll: [],
        afterAll: [],
        cases: ['a', 'b'].map((caseId) => ({
          caseId,
          name: `${projectId} ${caseId}`,
          caseIndex: caseId === 'a' ? 0 : 1,
          status: 'success',
          attempts: [
            {
              attemptId: `${projectId}:${caseId}:attempt`,
              attemptIndex: 0,
              status: 'success',
              ...time,
              beforeEach: [],
              afterEach: [],
              steps: [
                {
                  id: `${projectId}:${caseId}:step`,
                  node: 'aiAssert',
                  phase: 'steps',
                  stepIndex: 0,
                  status: 'success',
                  continuedAfterError: false,
                  ...time,
                },
              ],
            },
          ],
        })),
      },
    ],
  })),
});
const noop = () => {};
const renderCase = (
  dump: TestRunReportDump,
  index: number,
  standalone = false,
  reports: PlaywrightTasks[] = [],
) =>
  renderToStaticMarkup(
    <CaseWorkspace
      item={flattenRunnerCases(dump)[index]}
      issues={collectReportIssues(dump)}
      standaloneRun={standalone ? dump : undefined}
      reports={reports}
      visualIndex={buildRunnerVisualIndex(reports)}
      renderAgentReport={() => null}
      onBack={noop}
      backLabel="Overview"
    />,
  );
const renderOverview = (dump: TestRunReportDump) => {
  const cases = flattenRunnerCases(dump);
  const projects = groupRunnerProjects(dump, cases);
  return renderToStaticMarkup(
    <RunOverview
      dump={dump}
      issues={collectReportIssues(dump)}
      cases={cases}
      projects={projects}
      health={getRunnerHealth(cases)}
      visualIndex={buildRunnerVisualIndex([])}
      caseDisplayMode="compact"
      onCaseDisplayModeChange={noop}
      expandedProjectKeys={new Set(projects.map((project) => project.key))}
      onExpandedProjectKeysChange={noop}
      onOpenCase={noop}
    />,
  );
};

describe('report issue ownership', () => {
  it('keeps evidence loss on its node without repeating aggregate usage warnings', () => {
    const dump = fixture();
    dump.metrics.collection!.status = 'partial';
    const step = dump.projects[0].documents[0].cases[0].attempts[0].steps[0];
    step.metrics = {
      ...dump.metrics,
      collection: {
        status: 'unknown',
        expectedExecutionCount: 1,
        capturedExecutionCount: 0,
        reasons: ['Usage record missing.'],
        fields: {
          modelCallCount: 'unknown',
          modelTimeMs: 'unknown',
          totalTokens: 'unknown',
        },
      },
    };
    step.agentDetailDiagnostic = 'Agent execution details are unavailable.';
    dump.metrics.collection!.reasons = ['Usage record missing.'];
    step.evidenceCollection = {
      status: 'unknown',
      modelUsageUnavailable: true,
      errors: [
        {
          name: 'Error',
          code: 'REPORT_SNAPSHOT_FAILED',
          message: 'Snapshot storage unavailable.',
        },
      ],
    };
    const issues = collectReportIssues(dump);
    expect(issues.nodes.get(step.id)).toHaveLength(1);
    expect(issues.others).toEqual([]);
    expect(
      getIssuePresentation(issues.nodes.get(step.id)![0]).message,
    ).toContain('token total');
    expect(renderCase(dump, 0)).toContain('Snapshot storage unavailable.');
    for (const index of [1, 2, 3])
      expect(renderCase(dump, index)).not.toContain(
        'Snapshot storage unavailable.',
      );
    expect(renderOverview(dump)).not.toContain(
      'Model usage totals are incomplete',
    );
    expect(renderOverview(dump)).not.toContain('Snapshot storage unavailable.');
  });

  it('keeps screenshot loss separate from complete usage and preserves an independent unowned usage warning', () => {
    const dump = fixture();
    const step = dump.projects[0].documents[0].cases[0].attempts[0].steps[0];
    step.metrics = dump.metrics;
    step.evidenceCollection = {
      status: 'partial',
      errors: [
        {
          name: 'Error',
          code: 'SCREENSHOT_FAILED',
          message: 'Screenshot file unavailable.',
        },
      ],
    };
    expect(getStepIssues(step).map((issue) => issue.code)).toEqual([
      'SCREENSHOT_FAILED',
    ]);
    dump.metrics = {
      ...dump.metrics,
      collection: {
        ...dump.metrics.collection!,
        status: 'partial',
        reasons: ['Unowned provider usage missing.'],
      },
    };
    expect(getRunIssues(collectReportIssues(dump))).toMatchObject([
      { code: 'PARTIAL_MODEL_METRICS' },
    ]);
  });

  it('routes incomplete provider usage to its exact execution, including a successful assertion', () => {
    const dump = fixture();
    dump.metrics.collection!.status = 'partial';
    const step = dump.projects[0].documents[0].cases[0].attempts[0].steps[0];
    step.agentDetails = [{ reportId: 'agent', executionId: 'execution' }];
    step.metrics = {
      ...dump.metrics,
      modelCallCount: 1,
      totalTokens: 10,
      collection: {
        status: 'partial',
        expectedExecutionCount: 1,
        capturedExecutionCount: 1,
        reasons: ['Some model usage records do not include request duration.'],
        fields: {
          modelCallCount: 'complete',
          modelTimeMs: 'unknown',
          totalTokens: 'complete',
        },
      },
    };
    dump.metrics.collection!.reasons = step.metrics.collection!.reasons;
    const issues = collectReportIssues(dump);
    expect(issues.nodes.get(step.id)).toMatchObject([
      { code: 'PARTIAL_MODEL_METRICS', severity: 'warning' },
    ]);
    expect(issues.others).toEqual([]);
    expect(
      getIssuePresentation(issues.nodes.get(step.id)![0]).message,
    ).toContain('model time could not be fully collected');
    expect(
      getIssuePresentation(issues.nodes.get(step.id)![0]).message,
    ).not.toContain('token total');
    expect(renderCase(dump, 0)).toContain('Model usage totals are incomplete');
    expect(renderCase(dump, 1)).not.toContain('Model usage totals');
    expect(step.status).toBe('success');
    // Identical provider messages do not make an unrelated, unowned issue disappear.
    dump.executionMetrics = { execution: step.metrics, unowned: step.metrics };
    expect(getRunIssues(collectReportIssues(dump))).toMatchObject([
      { code: 'PARTIAL_MODEL_METRICS' },
    ]);
    step.agentDetailDiagnostic = 'Execution details unavailable.';
    step.evidenceCollection = {
      status: 'unknown',
      errors: [
        {
          name: 'Error',
          code: 'REPORT_SNAPSHOT_FAILED',
          message: 'Snapshot storage unavailable.',
        },
      ],
    };
    expect(getStepIssues(step).map((issue) => issue.code)).toEqual([
      'REPORT_SNAPSHOT_FAILED',
      'PARTIAL_MODEL_METRICS',
    ]);
  });

  it('isolates run, project, document and Case issues, including sibling Cases and attempts', () => {
    const dump = fixture();
    const project = dump.projects[0];
    const document = project.documents[0];
    project.lifecycle = {
      status: 'failed',
      ...time,
      setupError: { name: 'Error', message: 'Project session failed.' },
    };
    document.hostErrors = [
      {
        phase: 'report',
        error: { name: 'Error', message: 'Shared document failed.' },
      },
    ];
    document.cases[0].attempts[0].hostErrors = [
      {
        phase: 'execution',
        error: { name: 'Error', message: 'Case observer failed.' },
      },
    ];
    dump.diagnostics = [
      {
        level: 'error',
        code: 'run-infrastructure-error',
        message: 'Engine failed.',
      },
    ];
    const issues = collectReportIssues(dump);
    expect(getRunIssues(issues).map((issue) => issue.message)).toEqual([
      'Engine failed.',
    ]);
    expect(
      getProjectIssues(issues, 'one').map((issue) => issue.message),
    ).toEqual(['Project session failed.', 'Shared document failed.']);
    expect(getProjectIssues(issues, 'two')).toEqual([]);
    expect(
      getCaseIssues(
        issues,
        { projectId: 'one', documentId: document.documentId, caseId: 'a' },
        new Set(['other-attempt']),
      ),
    ).toEqual([]);
    expect(renderCase(dump, 0)).toContain('Case observer failed.');
    for (const index of [1, 2, 3])
      expect(renderCase(dump, index)).not.toContain('Case observer failed.');
    for (const index of [0, 1, 2, 3]) {
      const html = renderCase(dump, index);
      expect(html).not.toContain('Engine failed.');
      expect(html).not.toContain('Project session failed.');
      expect(html).not.toContain('Shared document failed.');
    }
    const overview = renderOverview(dump);
    expect(overview).toContain('Engine failed.');
    expect(overview).toContain('Project session failed.');
    expect(overview).not.toContain('Case observer failed.');
    expect(overview.indexOf('Project session failed.')).toBeGreaterThan(
      overview.indexOf('runner-project-tree-node'),
    );
  });

  it('keeps unowned metrics on the overview and retains all issues in a standalone report', () => {
    const dump = fixture();
    dump.projects = [dump.projects[0]];
    dump.projects[0].documents[0].cases = [
      dump.projects[0].documents[0].cases[0],
    ];
    dump.metrics.collection!.status = 'unknown';
    dump.projects[0].lifecycle = {
      status: 'failed',
      ...time,
      setupError: { name: 'Error', message: 'Project session failed.' },
    };
    expect(renderCase(dump, 0)).not.toContain('Model usage totals');
    expect(renderOverview(dump)).toContain(
      'Model usage totals are unavailable',
    );
    const standalone = renderCase(dump, 0, true);
    expect(standalone).toContain('Project session failed.');
    expect(standalone).toContain('View all 2 issues');
    expect(standalone).not.toContain('runner-back-button');
  });
});
