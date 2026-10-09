import {
  ExecutionDump,
  GroupedActionDump,
  type TestRunReportDump,
  type TestRunReportStep,
} from '@midscene/core';
import { describe, expect, it, rs } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestReportFixture } from '../../../e2e/fixtures/test-report.mjs';
import type { PlaywrightTasks } from '../../types';
import { RunnerEvidenceInspector } from './evidence-inspector';
import type { RunnerInspectorTab } from './evidence-tabs';
import { type RunnerVisualFrame, flattenRunnerCases } from './model';

const source = {
  sources: [
    {
      reportId: 'agent-report',
      scopeId: 'attempt-2',
      sourcePath: 'agent.html',
      executionIds: ['selected-execution'],
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
const item = flattenRunnerCases(
  createTestReportFixture(source) as TestRunReportDump,
)[0];
const step = item.finalAttempt!.steps.find(
  (step): step is Exclude<TestRunReportStep, { status: 'not-run' }> =>
    step.status !== 'not-run' && Boolean(step.agentDetails?.length),
)!;
const report: PlaywrightTasks = {
  reportId: 'agent-report',
  attributes: {
    playwright_test_id: 'agent',
    playwright_test_title: 'Agent',
    playwright_test_description: '',
    playwright_test_status: 'passed',
    playwright_test_duration: 1000,
  },
  get: () =>
    new GroupedActionDump({
      sdkVersion: 'test',
      groupName: 'Agent',
      groupDescription: '',
      modelBriefs: [],
      executions: ['selected-execution', 'unrelated-execution'].map(
        (id) => new ExecutionDump({ id, name: id, logTime: 0, tasks: [] }),
      ),
    }),
};

describe('case evidence inspection', () => {
  const render = (
    tab: RunnerInspectorTab,
    reports = [report],
    selectedStep: TestRunReportStep = step,
    activeFrame?: RunnerVisualFrame,
  ) => {
    const renderAgentReport = rs.fn((reports: PlaywrightTasks[]) => (
      <div>
        {reports
          .flatMap((report) =>
            report.get().executions.map((execution) => execution.name),
          )
          .join(', ')}
      </div>
    ));
    const html = renderToStaticMarkup(
      <RunnerEvidenceInspector
        item={item}
        attempt={item.finalAttempt}
        step={selectedStep}
        activeFrame={activeFrame}
        tab={tab}
        reports={reports}
        renderAgentReport={renderAgentReport}
        onTabChange={() => {}}
      />,
    );
    return { html, renderAgentReport };
  };

  it.each([
    ['success', undefined, 'success'],
    ['failed', { name: 'Error', message: 'Assertion failed' }, 'failed'],
    ['failed', { name: 'TimeoutError', message: 'Timed out' }, 'timeout'],
    ['not-run', undefined, 'not run'],
  ] as const)(
    'labels step status independently of Case pass: %s',
    (status, error, label) => {
      const { html } = render(
        'io',
        [],
        status === 'not-run'
          ? {
              ...step,
              status,
              startedAt: undefined,
              endedAt: undefined,
              durationMs: undefined,
              notRunReason: 'Previous step failed.',
            }
          : { ...step, status, error },
      );
      const heading = html.slice(
        html.indexOf('runner-detail-evidence-title'),
        html.indexOf('</header>'),
      );
      expect(heading).toContain(`<span>${label}</span>`);
      expect(heading).not.toContain('<span>passed</span>');
    },
  );

  it('embeds only the selected step executions inside the case page', () => {
    const { html, renderAgentReport } = render('record');
    expect(renderAgentReport).toHaveBeenCalledTimes(1);
    expect(html).toContain('selected-execution');
    expect(html).not.toContain('unrelated-execution');
    expect(html).toContain(
      'runner-detail-inspector-content has-stable-trace-height',
    );
    expect(html).not.toContain('Open AI trace in new tab');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('role="dialog"');
  });

  it('distinguishes Runner return from actual operation settlement at the snapshot boundary', () => {
    const { html } = render('logs', [report], {
      ...step,
      operations: {
        capturedAt: '2026-10-08T11:00:00.000Z',
        events: [
          {
            operationId: 'operation',
            operationKind: 'node',
            kind: 'runner-returned',
            at: '2026-10-08T10:59:59.000Z',
            pending: true,
            status: 'failed',
          },
        ],
      },
    });
    expect(html).not.toContain('Operation lifecycle');
    expect(html).toContain('still running when Runner returned');
    const { html: information } = render('io', [report], {
      ...step,
      operations: { capturedAt: '2026-10-08T11:00:00.000Z', events: [] },
    });
    expect(information).toContain('this snapshot does not update');
    expect(information).toContain('2026-10-08T11:00:00.000Z');
  });

  it('does not mount the player when inspecting data or events', () => {
    for (const tab of ['io', 'logs'] as const) {
      const { html, renderAgentReport } = render(tab);
      expect(renderAgentReport).not.toHaveBeenCalled();
      expect(html).toContain(tab === 'io' ? 'Input</h4>' : 'Step started:');
      expect(html).toContain(
        'runner-detail-inspector-content has-stable-trace-height',
      );
    }
  });

  it('reports missing agent data instead of presenting a blank player', () => {
    const { html, renderAgentReport } = render('record', []);
    expect(renderAgentReport).not.toHaveBeenCalled();
    expect(html).toContain('The referenced Agent report group is missing.');
  });

  it('shows partial collection as a warning card and keeps capture details in Information', () => {
    const { html, renderAgentReport } = render('io', [report], {
      ...step,
      evidenceCollection: {
        status: 'partial',
        capturedAt: '2026-10-08T00:00:00.000Z',
        errors: [{ name: 'Error', message: 'Snapshot write failed.' }],
      },
    });
    expect(renderAgentReport).not.toHaveBeenCalled();
    expect(html).toContain('Node issues');
    expect(html.match(/Snapshot write failed\./g)).toHaveLength(1);
    expect(html).toContain('2026-10-08T00:00:00.000Z');
    expect(html).toContain('runner-error-card is-warning');
    expect(html.indexOf('</header>')).toBeLessThan(
      html.indexOf('aria-label="Node issues"'),
    );
    expect(html.indexOf('aria-label="Node issues"')).toBeLessThan(
      html.indexOf('role="tablist"'),
    );
  });

  it('hides Record and falls back to Information when the step has no recording or screenshot', () => {
    const { html, renderAgentReport } = render('record', [], {
      ...step,
      node: 'custom.verify',
      agentDetails: undefined,
    });
    expect(renderAgentReport).not.toHaveBeenCalled();
    expect(html).not.toContain('>Record</button>');
    expect(html).toMatch(
      /aria-selected="true" class="is-selected">Information<\/button>/,
    );
    expect(html).toContain('<h4>Input</h4>');
    expect(html).not.toContain('Open AI trace in new tab');
    expect(html).not.toContain('has-stable-trace-height');
  });

  it('keeps Record available when the step has a screenshot', () => {
    const screenshotFrame: RunnerVisualFrame = {
      key: 'screenshot-frame',
      reportId: 'agent-report',
      executionId: 'screenshot-execution',
      label: 'Step screenshot',
      screenshot: { base64: 'data:image/png;base64,c2NyZWVuc2hvdA==' },
    };
    const { html } = render(
      'record',
      [],
      {
        ...step,
        node: 'custom.verify',
        agentDetails: undefined,
      },
      screenshotFrame,
    );
    expect(html).toMatch(
      /aria-selected="true" class="is-selected">Record<\/button>/,
    );
    expect(html).toContain('Captured evidence for custom.verify');
    expect(html).toContain(screenshotFrame.screenshot.base64);
    expect(html).not.toContain('has-stable-trace-height');
  });

  it('shows the output summary as the step description and keeps the error copy action icon-only', () => {
    const { html } = render('io', [], {
      ...step,
      node: 'demo.applyProjectOutcome',
      title: undefined,
      status: 'failed',
      output: {
        summary: '[parallel-watch] Case B passed on retry Attempt 2.',
      },
      error: {
        name: 'NodeExecutionError',
        code: 'NODE_EXECUTION_ERROR',
        message:
          'Node "demo.applyProjectOutcome" failed: planned final failure.',
      },
      agentDetails: undefined,
    });

    expect(html).toContain(
      '<p class="runner-detail-step-description">[parallel-watch] Case B passed on retry Attempt 2.</p>',
    );
    expect(html).toContain('aria-label="Copy issue details"');
    expect(html).toContain('title="Copy issue details"');
    expect(html).not.toContain('>Copy error</button>');
  });
});
