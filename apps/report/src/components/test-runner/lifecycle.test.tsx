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
import { LifecycleErrors, getProjectLifecycleIssues } from './lifecycle-errors';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getRunnerHealth,
} from './model';
import { SingleCaseRunInfo } from './single-case-run-info';
import { TestPlan } from './test-plan';

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
    const html = renderToStaticMarkup(<SingleCaseRunInfo dump={dump} />);
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
      const markup = renderToStaticMarkup(<SingleCaseRunInfo dump={dump} />);
      if (status === 'unknown') {
        expect(markup).toContain('Model metrics unknown');
        expect(markup).toContain('<strong>—</strong> model calls');
        expect(markup).not.toContain('<strong>5</strong> model calls');
      } else {
        expect(markup).toContain('<strong>5</strong> model calls');
        expect(markup).toContain('<strong>1,234</strong> tokens');
        expect(markup.includes('Partial model metrics')).toBe(
          status === 'partial',
        );
      }
    },
  );
  it('hides an empty diagnostics list', () => {
    expect(renderToStaticMarkup(<LifecycleErrors issues={[]} />)).toBe('');
  });

  it('renders collapsed diagnostics with safe text and sanitization notices', () => {
    const html = renderToStaticMarkup(
      <LifecycleErrors
        issues={[
          {
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
    expect(html).toContain('<details class="runner-lifecycle-issue">');
    expect(html).not.toContain(' open=""');
    expect(html).toContain('<summary>');
    expect(html).not.toContain('Details');
    expect(html).toContain('PROJECT_TEARDOWN_ERROR');
    expect(html).toContain('ProjectTeardownError');
    expect(html).toContain('registrationIndex');
    expect(html).toContain('Redacted: $.apiKey');
    expect(html).toContain('Truncated: $.logs');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;failed&lt;/script&gt;');
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
    expect(html).toContain('fixture-database');
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
    expect(html).toContain('Document setup step 1 failed');
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

  it('shows filtered cases in the independent plan without adding execution outcomes', () => {
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
    const html = renderToStaticMarkup(<TestPlan dump={dump} />);
    expect(html).toContain('Filtered Beijing preview');
    expect(html).toContain('Filtered by case selection');
    expect(html).toContain('${mapLocation}');
    expect(html).toContain('Variables remain as placeholders');
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

  it('collects project, document, and attempt errors without dropping the blocked document', () => {
    const dump = lifecycle();
    const issues = getProjectLifecycleIssues(dump.projects[0]);
    expect(issues.map((issue) => issue.error.message)).toEqual([
      'Project browser disposal failed.',
      'Document fixture disposal failed.',
      'Case session disposal failed.',
      'Database connection refused.',
    ]);
    const html = renderToStaticMarkup(<LifecycleErrors issues={issues} />);
    for (const issue of issues) expect(html).toContain(issue.error.message);
    const standalone = renderToStaticMarkup(<SingleCaseRunInfo dump={dump} />);
    expect(standalone).toContain('Project browser disposal failed.');
    expect(standalone).toContain('Document fixture disposal failed.');
    // Attempt errors are rendered beside the selected attempt, not repeated in run diagnostics.
    expect(standalone).not.toContain('Case session disposal failed.');
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
