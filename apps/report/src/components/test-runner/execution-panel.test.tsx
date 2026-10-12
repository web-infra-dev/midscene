import type { TestRunReportStep } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunnerExecutionPanel } from './execution-panel';

const step = (
  id: string,
  phase: TestRunReportStep['phase'] = 'steps',
): Extract<TestRunReportStep, { status: 'success' | 'failed' }> => ({
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
      >
        <section data-testid="node-details" />
      </RunnerExecutionPanel>,
    );
    expect(html).toContain('data-testid="timeline"');
    expect(html).toContain('class="is-selected"');
    expect(html).toContain('aria-pressed="true"');
    expect(html.indexOf('data-testid="timeline"')).toBeLessThan(
      html.indexOf('runner-detail-execution-body'),
    );
    expect(html).toMatch(
      /<nav[^>]*aria-label="Execution steps"[\s\S]*<\/nav><div[^>]*role="separator"[^>]*><\/div><section data-testid="node-details"/,
    );
    expect(html).toContain('aria-label="Resize execution steps"');
    expect(html).toContain('aria-valuenow="320"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).not.toContain('is-playing');
    expect(html).not.toContain('timeline-control');
    expect(html).not.toContain('runner-detail-step-type');
  });

  it('keeps case controls in the execution header in both views', () => {
    for (const view of ['visual', 'yaml'] as const) {
      const html = renderToStaticMarkup(
        <RunnerExecutionPanel
          groups={[]}
          view={view}
          sourceYaml={{ value: 'cases: []' }}
          renderToolbar={(viewSwitch) => (
            <>
              {viewSwitch}
              <button type="button">Attempt 2</button>
              <span>12 total steps</span>
            </>
          )}
          onSelect={() => {}}
        />,
      );
      expect(html).toMatch(
        /runner-detail-panel-heading[\s\S]*Execution view[\s\S]*Attempt 2[\s\S]*12 total steps[\s\S]*<\/div>/,
      );
    }
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
      >
        <section data-testid="node-details" />
      </RunnerExecutionPanel>,
    );
    expect(html).toContain('cases/search.yaml');
    expect(html).toContain('# Original comment');
    expect(html).toContain('${search}');
    expect(html).toContain('runner-yaml-key');
    expect(html).toContain('runner-yaml-comment');
    expect(html).toContain('Sensitive fields are redacted.');
    expect(html).toContain('Source YAML is truncated.');
    expect(html).not.toContain('data-testid="timeline"');
    expect(html).toContain('class="runner-detail-execution-body" hidden=""');
    expect(html).toContain('data-testid="node-details"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('shows success, failure, timeout and not-run markers with separate evidence warnings', () => {
    const steps: TestRunReportStep[] = [
      step('aiAct'),
      { ...step('aiAssert'), stepIndex: 1, status: 'failed' },
      {
        ...step('wait'),
        stepIndex: 2,
        status: 'failed',
        error: { name: 'TimeoutError', message: 'Operation timed out.' },
      },
      {
        id: 'check',
        node: 'check',
        phase: 'steps',
        stepIndex: 3,
        status: 'not-run',
        continuedAfterError: false,
        notRunReason: 'An earlier step timed out.',
      },
    ];
    const html = renderToStaticMarkup(
      <RunnerExecutionPanel
        groups={[{ label: 'Case steps', steps }]}
        sourceYaml={{
          value: `cases:
  - name: Search
    steps:
      - aiAct: '<script>alert("x")</script>'
      - aiAssert: check
      - wait: 1000
      - check: ready
`,
        }}
        issues={
          new Map([
            [
              'aiAct',
              [
                {
                  id: 'capture',
                  severity: 'warning',
                  code: 'PARTIAL_EVIDENCE',
                  message: 'Screenshot unavailable.',
                },
              ],
            ],
          ])
        }
        view="yaml"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('Success: aiAct. View step details (with warnings)');
    expect(html).toContain('Failed: aiAssert. View step details');
    expect(html).toContain('Timeout: wait. View step details');
    expect(html).toContain('Not run: check. View step details');
    expect(html).toContain('runner-yaml-marker is-success');
    expect(html).toContain('runner-yaml-marker is-failed');
    expect(html).toContain('runner-yaml-marker is-timeout');
    expect(html).toContain('runner-yaml-marker is-not-run');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
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
