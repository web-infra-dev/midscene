import {
  ExecutionDump,
  GroupedActionDump,
  type TestRunReportDump,
} from '@midscene/core';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestReportFixture } from '../../../e2e/fixtures/test-report.mjs';
import type { PlaywrightTasks } from '../../types';
import { RunnerEvidenceInspector } from './evidence-inspector';
import type { RunnerInspectorTab } from './evidence-tabs';
import { flattenRunnerCases } from './model';

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
  beforeEach(() => {
    rs.stubGlobal('window', {
      location: {
        href: 'http://localhost/report.html#runner-page=case&runner-case=checkout',
      },
    });
  });
  afterEach(() => {
    rs.unstubAllGlobals();
  });

  const render = (
    tab: RunnerInspectorTab,
    reports = [report],
    selectedStep = step,
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
        tab={tab}
        reports={reports}
        renderAgentReport={renderAgentReport}
        onTabChange={() => {}}
      />,
    );
    return { html, renderAgentReport };
  };

  it('embeds only the selected step executions and preserves the separate trace link', () => {
    const { html, renderAgentReport } = render('record');
    expect(renderAgentReport).toHaveBeenCalledTimes(1);
    expect(html).toContain('selected-execution');
    expect(html).not.toContain('unrelated-execution');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('runner-trace=page');
    expect(html).toContain(`runner-step=${encodeURIComponent(step.id)}`);
    expect(html).not.toContain('role="dialog"');
  });

  it('does not mount the player when inspecting data or events', () => {
    for (const tab of ['io', 'logs'] as const) {
      const { html, renderAgentReport } = render(tab);
      expect(renderAgentReport).not.toHaveBeenCalled();
      expect(html).toContain(tab === 'io' ? 'Input</h4>' : 'Step started:');
    }
  });

  it('reports missing agent data instead of presenting a blank player', () => {
    const { html, renderAgentReport } = render('record', []);
    expect(renderAgentReport).not.toHaveBeenCalled();
    expect(html).toContain('The referenced Agent report group is missing.');
  });

  it('keeps the screenshot fallback for steps without an agent recording', () => {
    const { html, renderAgentReport } = render('record', [], {
      ...step,
      node: 'custom.verify',
      agentDetails: undefined,
    });
    expect(renderAgentReport).not.toHaveBeenCalled();
    expect(html).toContain('No screenshot for this Step');
    expect(html).not.toContain('Open AI trace in new tab');
  });
});
