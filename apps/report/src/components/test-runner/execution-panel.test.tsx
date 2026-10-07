import type { TestRunReportStep } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunnerExecutionPanel } from './execution-panel';

const step = (
  id: string,
  phase: TestRunReportStep['phase'] = 'steps',
): TestRunReportStep => ({
  id,
  phase,
  stepIndex: 0,
  node: id,
  status: 'success',
  continuedAfterError: false,
  startedAt: '2026-09-21T00:00:00.000Z',
  endedAt: '2026-09-21T00:00:01.000Z',
  durationMs: 1_000,
});

describe('execution panel', () => {
  it('places playback in the case-step column and marks the playing step', () => {
    const html = renderToStaticMarkup(
      <RunnerExecutionPanel
        groups={[
          { label: 'Document setup', steps: [step('setup', 'beforeAll')] },
          { label: 'Case steps', steps: [step('aiAct')] },
        ]}
        selectedStepId="aiAct"
        playingStepId="aiAct"
        timeline={<div data-testid="timeline" />}
        timelineControl={
          <button type="button" data-testid="playback">
            Pause
          </button>
        }
        onSelect={() => {}}
      />,
    );

    const panelHeading = html.slice(
      html.indexOf('runner-detail-panel-heading'),
      html.indexOf('data-testid="timeline"'),
    );
    expect(panelHeading).not.toContain('data-testid="playback"');
    expect(panelHeading).not.toContain('2 steps');
    expect(html.match(/data-testid="playback"/g)).toHaveLength(1);
    expect(html).toMatch(
      /<h3><span>Case steps<\/span><button[^>]*data-testid="playback">Pause<\/button><\/h3>/,
    );
    expect(html).toContain('class="is-selected is-playing"');
    expect(html).toContain('aria-current="step"');
  });
});
