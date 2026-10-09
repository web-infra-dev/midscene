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
  it('marks evidence warnings without changing the successful node status', () => {
    const html = renderToStaticMarkup(
      <RunnerExecutionPanel
        groups={[{ label: 'Case steps', steps: [step('aiAct')] }]}
        issues={
          new Map([
            [
              'aiAct',
              [
                {
                  id: 'evidence',
                  severity: 'warning',
                  code: 'PARTIAL_EVIDENCE',
                  message: 'Partial capture.',
                },
              ],
            ],
          ])
        }
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('Step warning');
    expect(html).toContain('is-success');
    expect(html).not.toContain('is-error');
  });

  it('keeps the selected step and timeline without playback controls', () => {
    const html = renderToStaticMarkup(
      <RunnerExecutionPanel
        groups={[
          { label: 'Document setup', steps: [step('setup', 'beforeAll')] },
          { label: 'Case steps', steps: [step('aiAct')] },
        ]}
        selectedStepId="aiAct"
        timeline={<div data-testid="timeline" />}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('data-testid="timeline"');
    expect(html).toContain('class="is-selected"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('is-playing');
    expect(html).not.toContain('timeline-control');
  });

  it('shows the captured YAML with author comments, placeholders and redaction notes', () => {
    const html = renderToStaticMarkup(
      <RunnerExecutionPanel
        groups={[{ label: 'Case steps', steps: [step('aiAct')] }]}
        selectedStepId="aiAct"
        sourcePath="cases/search.yaml"
        sourceYaml={{
          value: '# Original comment\ncases: $' + '{search}\n',
          redactedPaths: ['$..password'],
          truncatedPaths: ['$'],
        }}
        view="yaml"
        timeline={<div data-testid="timeline" />}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('cases/search.yaml');
    expect(html).toContain('# Original comment\ncases: $' + '{search}\n');
    expect(html).toContain('Sensitive fields are redacted.');
    expect(html).toContain('Source YAML is truncated.');
    expect(html).not.toContain('data-testid="timeline"');
    expect(html).toContain('class="runner-detail-step-scroll" hidden=""');
    expect(html).toContain('aria-pressed="true"');
  });

  it('keeps Visual available when no YAML snapshot was captured', () => {
    const html = renderToStaticMarkup(
      <RunnerExecutionPanel
        groups={[{ label: 'Case steps', steps: [step('aiAct')] }]}
        view="yaml"
        selectedStepId="aiAct"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('Source YAML is unavailable for this document.');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('aria-label="Source YAML"');
  });
});
