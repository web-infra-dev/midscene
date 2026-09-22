import {
  ExecutionDump,
  GroupedActionDump,
  type TestRunReportDump,
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
  (step) => step.agentDetails?.length,
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
    selectedStep = step,
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

  it('hides Record and falls back to Input & output when the step has no recording or screenshot', () => {
    const { html, renderAgentReport } = render('record', [], {
      ...step,
      node: 'custom.verify',
      agentDetails: undefined,
    });
    expect(renderAgentReport).not.toHaveBeenCalled();
    expect(html).not.toContain('>Record</button>');
    expect(html).toMatch(
      /aria-selected="true" class="is-selected">Input &amp; output<\/button>/,
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
    expect(html).toContain('aria-label="Copy error details"');
    expect(html).toContain('title="Copy error details"');
    expect(html).not.toContain('>Copy error</button>');
  });
});
