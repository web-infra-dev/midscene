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
} from './case-workspace-model';
import { LifecycleErrors, getProjectLifecycleIssues } from './lifecycle-errors';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getRunnerHealth,
} from './model';
import { SingleCaseRunInfo } from './single-case-run-info';

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
        tracePage={false}
        renderAgentReport={() => null}
        onBack={noop}
        onCloseTracePage={noop}
        backLabel="Overview"
      />,
    );
    expect(html).toContain('runner-detail-debug-workbench');
    expect(html).toContain('Database connection refused.');
    expect(html).toContain('fixture-database');
    expect(html).not.toContain('aria-label="Attempts"');
  });

  it('renders teardown errors even if the selected case step succeeded', () => {
    const item = flattenRunnerCases(lifecycle())[0];
    expect(item.finalAttempt?.steps[0].status).toBe('success');
    const html = renderToStaticMarkup(
      <CaseWorkspace
        item={item}
        reports={[]}
        visualIndex={buildRunnerVisualIndex([])}
        tracePage={false}
        renderAgentReport={() => null}
        onBack={noop}
        onCloseTracePage={noop}
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
    item.document.afterAll = [
      {
        ...item.finalAttempt!.steps[0],
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
