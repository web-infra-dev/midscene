import type { TestRunReportDump } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createLifecycleReportFixture,
  createTestReportFixture,
} from '../../../e2e/fixtures/test-report.mjs';
import { CaseWorkspace } from './case-workspace';
import {
  getCaseWorkspaceStepGroups,
  getDefaultCaseWorkspaceStep,
  getWorkspaceTimelineRange,
} from './case-workspace-model';
import { ErrorCards } from './error-card';
import { collectReportIssues } from './issues';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getRunnerHealth,
} from './model';
import { SingleCaseRunInfo } from './single-case-run-info';
import { getWorkspaceStepSummary } from './use-case-workspace';

const source = {
  sources: [
    {
      reportId: 'agent-report',
      scopeId: 'attempt-2',
      sourcePath: 'agent.html',
      executionIds: ['agent-execution'],
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
const lifecycle = () =>
  createLifecycleReportFixture(source) as TestRunReportDump;
const noop = () => {};

describe('report lifecycle failures', () => {
  it.each([false, true])(
    'preserves a host failure when a teardown plan exists: %s',
    (hasPlannedStep) => {
      const item = flattenRunnerCases(
        createTestReportFixture(source) as TestRunReportDump,
      )[0];
      const step = item.finalAttempt!.steps[0];
      if (step.status === 'not-run')
        throw new Error('Fixture needs an executed step');
      item.document.plan = {
        documentId: item.document.documentId,
        sourcePath: item.document.sourcePath,
        retry: { scope: 'case', count: 0 },
        beforeAll: [],
        afterAll: hasPlannedStep
          ? [
              {
                id: 'planned-cleanup',
                phase: 'afterAll',
                stepIndex: step.stepIndex,
                node: 'cleanup',
                input: { value: {} },
                inputMode: 'template',
                continueOnError: false,
              },
            ]
          : [],
        cases: [],
      };
      item.document.afterAll = [
        {
          ...step,
          id: 'host-failure',
          phase: 'afterAll',
          node: 'runner:host-result',
          status: 'failed',
        },
      ];
      const steps = getCaseWorkspaceStepGroups(item, item.finalAttempt).flatMap(
        (group) => group.steps,
      );
      expect(steps).toContainEqual(item.document.afterAll[0]);
      expect(getWorkspaceStepSummary(steps).failed).toBe(1);
      expect(getWorkspaceStepSummary(steps).notRun).toBe(
        hasPlannedStep ? 1 : 0,
      );
    },
  );

  it('keeps global warnings safe when no Case attempt exists', () => {
    const dump = lifecycle();
    const item = flattenRunnerCases(dump).find(
      (item) => item.testCase.caseId === 'blocked-case',
    )!;
    const html = renderToStaticMarkup(
      <CaseWorkspace
        item={item}
        issues={collectReportIssues(dump)}
        reports={[]}
        visualIndex={buildRunnerVisualIndex([])}
        renderAgentReport={() => null}
        onBack={noop}
        backLabel="Overview"
      />,
    );
    expect(html).toContain('MODEL_METRICS_UNKNOWN');
    expect(html).toContain('Database connection refused.');
    expect(html).not.toContain('Case · Attempt');
    expect(html.indexOf('aria-label="Other issues"')).toBeLessThan(
      html.indexOf('runner-case-run-bar'),
    );
    expect(html.indexOf('runner-detail-execution-body')).toBeLessThan(
      html.indexOf('aria-label="Node issues"'),
    );
    expect(html.match(/Database connection refused\./g)).toHaveLength(1);
  });

  it('uses a resource-blocked setup step as the reason for unexecuted planned steps', () => {
    const item = flattenRunnerCases(lifecycle()).find(
      (item) => item.testCase.caseId === 'blocked-case',
    )!;
    item.document.beforeAll = [
      {
        id: 'resource-blocked',
        phase: 'beforeAll',
        stepIndex: 0,
        node: 'aiAct',
        status: 'not-run',
        notRunReason: 'Agent is still running',
        blockedBy: 'original-step',
        continuedAfterError: false,
      },
    ];
    item.testCase.plan = {
      caseId: item.testCase.caseId,
      name: item.testCase.name,
      caseIndex: 0,
      selected: true,
      tags: [],
      beforeEach: [],
      afterEach: [],
      steps: [
        {
          id: 'planned',
          phase: 'steps',
          stepIndex: 0,
          node: 'aiAssert',
          input: { value: {} },
          inputMode: 'template',
          continueOnError: false,
        },
      ],
    };
    const planned = getCaseWorkspaceStepGroups(item).find(
      (group) => group.label === 'Case steps',
    )!.steps[0];
    expect(planned).toMatchObject({
      status: 'not-run',
      blockedBy: 'resource-blocked',
      notRunReason: expect.stringContaining('Agent is still running'),
    });
    expect(planned.startedAt).toBeUndefined();
    const dump = lifecycle();
    dump.operationLogs = [
      { path: '/tmp/operations.jsonl', snapshotAt: '2026-10-08T11:00:00.000Z' },
    ];
    const html = renderToStaticMarkup(
      <>
        <SingleCaseRunInfo dump={dump} />
        <ErrorCards
          issues={collectReportIssues(dump).others}
          label="Other issues"
        />
      </>,
    );
    expect(html).not.toContain('Operation event logs');
    expect(html).not.toContain('/tmp/operations.jsonl');
    expect(dump.operationLogs).toHaveLength(1);
  });
  it('keeps known calls visible when provider tokens and duration are unknown', () => {
    const dump = lifecycle();
    dump.metrics.collection = {
      status: 'partial',
      expectedExecutionCount: 1,
      capturedExecutionCount: 1,
      reasons: ['Provider usage is missing.'],
      fields: {
        modelCallCount: 'complete',
        modelTimeMs: 'unknown',
        totalTokens: 'unknown',
      },
    };
    dump.metrics.modelCallCount = 1;
    const html = renderToStaticMarkup(
      <>
        <SingleCaseRunInfo dump={dump} />
        <ErrorCards
          issues={collectReportIssues(dump).others}
          label="Other issues"
        />
      </>,
    );
    expect(html).toContain('<strong>1</strong> model calls');
    expect(html).toContain('<strong>—</strong> tokens');
    expect(html).toContain('<strong>—</strong> model time');
  });
  it.each(['complete', 'partial', 'unknown'] as const)(
    'presents %s model metric collection honestly',
    (status) => {
      const dump = lifecycle();
      dump.metrics = {
        ...dump.metrics,
        modelCallCount: 5,
        totalTokens: 1234,
        collection: {
          status,
          expectedExecutionCount: 7,
          capturedExecutionCount: status === 'unknown' ? 0 : 5,
          reasons: status === 'complete' ? [] : ['Snapshot collection failed.'],
        },
      };
      const markup = renderToStaticMarkup(
        <>
          <SingleCaseRunInfo dump={dump} />
          <ErrorCards
            issues={collectReportIssues(dump).others}
            label="Other issues"
          />
        </>,
      );
      if (status === 'unknown') {
        expect(markup).toContain('MODEL_METRICS_UNKNOWN');
        expect(markup).toContain('<strong>—</strong> model calls');
        expect(markup).not.toContain('<strong>5</strong> model calls');
      } else {
        expect(markup).toContain('<strong>5</strong> model calls');
        expect(markup).toContain('<strong>1,234</strong> tokens');
        expect(markup.includes('PARTIAL_MODEL_METRICS')).toBe(
          status === 'partial',
        );
      }
    },
  );
  it('hides an empty diagnostics list', () => {
    expect(
      renderToStaticMarkup(<ErrorCards issues={[]} label="Other issues" />),
    ).toBe('');
  });

  it('renders non-node issue details in their card with safe text and sanitization notices', () => {
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Other issues"
        showDetails
        issues={[
          {
            id: 'cleanup',
            severity: 'error',
            code: 'PROJECT_TEARDOWN_ERROR',
            message: '<script>failed</script>',
            label: 'Project cleanup',
            error: {
              name: 'ProjectTeardownError',
              code: 'PROJECT_TEARDOWN_ERROR',
              message: '<script>failed</script>',
              details: {
                value: { registrationIndex: 2, apiKey: '[REDACTED]' },
                redactedPaths: ['$.apiKey'],
                truncatedPaths: ['$.logs'],
              },
            },
          },
        ]}
      />,
    );
    expect(html).toContain('runner-error-card');
    expect(html).not.toContain('runner-run-information');
    expect(html).not.toContain(' open=""');
    expect(html).not.toContain('Causes and context');
    expect(html).not.toContain('Run diagnostics');
    expect(html).toContain('PROJECT_TEARDOWN_ERROR');
    expect(html).toContain('ProjectTeardownError');
    expect(html).toContain('registrationIndex');
    expect(html).toContain('Redacted: $.apiKey');
    expect(html).toContain('Truncated: $.logs');
    expect(html).not.toContain('<script>');
    expect(html.match(/&lt;script&gt;failed&lt;\/script&gt;/g)).toHaveLength(1);
  });

  it('keeps fixture outcomes and retry metrics deterministic', () => {
    const dump = createTestReportFixture(source) as TestRunReportDump;
    expect(getRunnerHealth(flattenRunnerCases(dump))).toMatchObject({
      finalPassRate: 1,
      firstPassRate: 0.5,
      retryPassedCount: 1,
    });
    expect(dump.durationMs).toBe(8000);
    expect(() => createTestReportFixture({ ...source, sources: [] })).toThrow(
      'requires an Agent execution',
    );
  });

  it('selects and renders failed document setup when no attempt exists', () => {
    const dump = lifecycle();
    const item = flattenRunnerCases(dump).find(
      (item) => item.testCase.caseId === 'blocked-case',
    )!;
    expect(item.finalAttempt).toBeUndefined();
    expect(getCaseWorkspaceStepGroups(item)).toMatchObject([
      { label: 'Document setup', steps: [{ node: 'fixture.connect' }] },
    ]);
    expect(getDefaultCaseWorkspaceStep(item)?.id).toBe('blocked:beforeAll:0');
    const html = renderToStaticMarkup(
      <CaseWorkspace
        item={item}
        reports={[]}
        visualIndex={buildRunnerVisualIndex([])}
        renderAgentReport={() => null}
        onBack={noop}
        backLabel="Overview"
      />,
    );
    expect(html).toContain('runner-detail-debug-workbench');
    expect(html).toContain('Database connection refused.');
    expect(html).not.toContain('runner-not-run-message');
    expect(html.match(/Database connection refused\./g)).toHaveLength(1);
    expect(html).not.toContain('authored execution');
    expect(html).not.toContain('Test plan');
    expect(html).not.toContain('aria-label="Attempts"');
    expect(html).not.toContain('runner-single-attempt-label');
    expect(html).not.toContain('Attempt 1');
    expect(html).toContain('aria-label="Execution visual timeline"');
  });

  it('shows planned steps with the setup failure reason and no artificial attempt or timestamps', () => {
    const item = flattenRunnerCases(lifecycle()).find(
      (item) => item.testCase.caseId === 'blocked-case',
    )!;
    item.testCase.plan = {
      caseId: item.testCase.caseId,
      name: item.testCase.name,
      caseIndex: 0,
      selected: true,
      tags: [],
      beforeEach: [],
      afterEach: [],
      steps: [
        {
          id: 'planned-map',
          phase: 'steps',
          stepIndex: 0,
          node: 'map.preview',
          title: 'Preview Beijing map',
          input: { value: { prompt: 'Preview Beijing map' } },
          inputMode: 'template',
          continueOnError: false,
        },
      ],
    };
    const groups = getCaseWorkspaceStepGroups(item);
    const planned = groups.find((group) => group.label === 'Case steps')!
      .steps[0];
    expect(planned).toMatchObject({
      status: 'not-run',
      blockedBy: 'blocked:beforeAll:0',
      notRunReason: expect.stringContaining('Document setup step 1 failed'),
    });
    expect(getWorkspaceTimelineRange([planned])).toBeUndefined();
    expect(planned).not.toHaveProperty('startedAt');
    expect(planned).not.toHaveProperty('durationMs');
    expect(
      getWorkspaceTimelineRange(groups.flatMap((group) => group.steps)),
    ).toMatchObject({
      startedAt: item.document.beforeAll[0].startedAt,
      endedAt: item.document.beforeAll[0].endedAt,
    });
    const html = renderToStaticMarkup(
      <CaseWorkspace
        item={item}
        initialStepId={planned.id}
        reports={[]}
        visualIndex={buildRunnerVisualIndex([])}
        renderAgentReport={() => null}
        onBack={noop}
        backLabel="Overview"
      />,
    );
    expect(html).toContain('Preview Beijing map');
    expect(html).not.toContain('Document setup step 1 failed');
    expect(html).toContain('Blocked by a preceding step.');
    expect(html).toContain('View blocking step');
    expect(html).not.toContain('Attempt 1');
    expect(item.testCase.attempts).toEqual([]);
  });

  it('computes the timeline across setup, case and teardown rather than clipping hook frames', () => {
    const item = flattenRunnerCases(lifecycle())[0];
    const attempt = item.finalAttempt!;
    const step = attempt.steps[0];
    if (step.status === 'not-run')
      throw new Error('Fixture needs an executed step');
    const beforeAll = {
      ...step,
      startedAt: '2026-10-08T00:00:00.000Z',
      endedAt: '2026-10-08T00:00:01.000Z',
    };
    const afterAll = {
      ...step,
      startedAt: '2026-10-08T00:00:20.000Z',
      endedAt: '2026-10-08T00:00:21.000Z',
    };
    const range = getWorkspaceTimelineRange([beforeAll, afterAll], {
      ...attempt,
      startedAt: '2026-10-08T00:00:05.000Z',
      endedAt: '2026-10-08T00:00:10.000Z',
    });
    expect(range).toEqual({
      startedAt: beforeAll.startedAt,
      endedAt: afterAll.endedAt,
      durationMs: 21_000,
    });
  });

  it('preserves filtered plans in data without displaying optional selection details', () => {
    const dump = lifecycle();
    const beforeAll = dump.projects[0].documents[0].beforeAll;
    dump.projects[0].plans = [
      {
        documentId: 'plan-only',
        sourcePath: 'filtered-map.yaml',
        retry: { scope: 'case', count: 2 },
        beforeAll: [],
        afterAll: [],
        cases: [
          {
            caseId: 'filtered-map',
            caseIndex: 0,
            name: 'Filtered Beijing preview',
            selected: false,
            tags: ['slow'],
            beforeEach: [],
            afterEach: [],
            steps: [
              {
                id: 'plan-only:step',
                phase: 'steps',
                stepIndex: 0,
                node: 'map.preview',
                input: { value: { prompt: '${mapLocation}' } },
                inputMode: 'template',
                continueOnError: false,
              },
            ],
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(
      <CaseWorkspace
        item={flattenRunnerCases(dump)[0]}
        standaloneRun={dump}
        reports={[]}
        visualIndex={buildRunnerVisualIndex([])}
        renderAgentReport={() => null}
        onBack={noop}
        backLabel="Overview"
      />,
    );
    expect(html).not.toContain('Filtered Beijing preview');
    expect(html).not.toContain('Filtered by case selection');
    expect(html).not.toContain('runner-run-information');
    expect(dump.projects[0].plans[0].cases[0].steps[0].input.value).toEqual({
      prompt: '${mapLocation}',
    });
    expect(html).not.toContain('map.preview');
    expect(dump.projects[0].documents[0].beforeAll).toBe(beforeAll);
    expect(
      flattenRunnerCases(dump).some(
        (item) => item.testCase.caseId === 'filtered-map',
      ),
    ).toBe(false);
  });

  it('renders teardown errors even if the selected case step succeeded', () => {
    const item = flattenRunnerCases(lifecycle())[0];
    expect(item.finalAttempt?.steps[0].status).toBe('success');
    const html = renderToStaticMarkup(
      <CaseWorkspace
        item={item}
        reports={[]}
        visualIndex={buildRunnerVisualIndex([])}
        renderAgentReport={() => null}
        onBack={noop}
        backLabel="Overview"
      />,
    );
    expect(html).toContain('Case session disposal failed.');
    expect(html).toContain('cart.verify');
  });

  it('keeps setup node errors out of scope errors without dropping either', () => {
    const dump = lifecycle();
    const issues = collectReportIssues({ projects: dump.projects });
    expect(issues.others.map((issue) => issue.message)).toEqual([
      'Project browser disposal failed.',
      'Document fixture disposal failed.',
      'Case session disposal failed.',
    ]);
    expect(issues.nodes.get('blocked:beforeAll:0')?.[0].message).toBe(
      'Database connection refused.',
    );
    const html = renderToStaticMarkup(
      <ErrorCards issues={issues.others} label="Other issues" />,
    );
    for (const issue of issues.others) expect(html).toContain(issue.message);
    expect(html).not.toContain('Database connection refused.');
  });

  it('prioritizes a failed document teardown over a successful case step', () => {
    const item = flattenRunnerCases(lifecycle())[0];
    const step = item.finalAttempt!.steps[0];
    if (step.status === 'not-run')
      throw new Error('Fixture needs an executed step');
    item.document.afterAll = [
      {
        ...step,
        id: 'afterAll:0',
        phase: 'afterAll',
        status: 'failed',
      },
    ];
    expect(getDefaultCaseWorkspaceStep(item, item.finalAttempt)?.id).toBe(
      'afterAll:0',
    );
  });
});
