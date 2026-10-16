import type {
  TestRunReportOperationEvent,
  TestRunReportStep,
} from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorCards } from './error-card';
import { EvidenceTabs } from './evidence-tabs';
import { IssueInformation } from './issue-information';
import { type ReportIssue, getStepIssues } from './issues';

const step: TestRunReportStep = {
  id: 'setup:1',
  node: 'aiAssert',
  phase: 'beforeAll',
  stepIndex: 1,
  status: 'failed',
  startedAt: '2026-10-09T06:00:00.000Z',
  endedAt: '2026-10-09T06:00:01.000Z',
  durationMs: 1000,
  continuedAfterError: false,
  input: { value: { prompt: 'Check the title' } },
  error: {
    name: 'NodeExecutionError',
    code: 'NODE_EXECUTION_ERROR',
    message: 'Node failed: Unexpected title.',
    cause: {
      name: 'AssertionError',
      message: 'Unexpected title.',
      details: { value: { expected: 'Debugger', actual: 'Debugger Tool' } },
    },
  },
};

describe('one home for errors and supporting information', () => {
  it('renders the core message once and keeps technical details collapsed in its card', () => {
    const issues = getStepIssues(step);
    const html = renderToStaticMarkup(
      <>
        <ErrorCards issues={issues} label="Node issues" />
        <IssueInformation issues={issues} />
      </>,
    );
    expect(html.match(/Unexpected title\./g)).toHaveLength(1);
    expect(html).toContain('Debugger Tool');
    expect(html).not.toContain('Causes and context');
    expect(html).toContain('<summary>details</summary>');
    expect(html).not.toContain(' open=""');
    const card = renderToStaticMarkup(
      <ErrorCards issues={issues} label="Node issues" />,
    );
    expect(card).toContain('Debugger Tool');
    expect(renderToStaticMarkup(<IssueInformation issues={issues} />)).toBe('');
  });

  it('shows warnings as cards and removes optional info without repeating messages', () => {
    const issues: ReportIssue[] = [
      {
        id: 'warning',
        severity: 'warning',
        code: 'PARTIAL_EVIDENCE',
        message: 'Evidence is incomplete.',
        context: { capturedAt: '2026-10-09T06:00:01.000Z' },
      },
      {
        id: 'optional',
        severity: 'info',
        code: 'REPORT_NOTE',
        message: 'An optional implementation note.',
      },
    ];
    const html = renderToStaticMarkup(
      <>
        <ErrorCards issues={issues} label="Node issues" />
        <IssueInformation issues={issues} />
      </>,
    );
    expect(html).toContain('is-warning');
    expect(html).toContain(
      '<strong>Some execution evidence is missing from this report</strong>',
    );
    expect(html.match(/Evidence is incomplete\./g)).toHaveLength(1);
    expect(html).toContain('2026-10-09T06:00:01.000Z');
    expect(html).not.toContain('An optional implementation note.');
    expect(html).not.toContain('REPORT_NOTE');
  });

  it('does not leave an empty cause section when the card already explains the cause', () => {
    const issues = getStepIssues({
      ...step,
      error: {
        name: 'Error',
        message: 'Node failed: Unexpected title.',
        cause: { name: 'Error', message: 'Unexpected title.' },
      },
    });
    expect(renderToStaticMarkup(<IssueInformation issues={issues} />)).toBe('');
  });

  it('retains exception types and codes when the card already includes their messages', () => {
    const issues = getStepIssues({
      ...step,
      error: {
        name: 'NodeExecutionError',
        code: 'NODE_EXECUTION_ERROR',
        message: 'Node failed: Permission denied.',
        cause: {
          name: 'DevicePermissionError',
          code: 'DEVICE_PERMISSION_DENIED',
          message: 'Permission denied.',
        },
      },
    });
    const html = renderToStaticMarkup(
      <>
        <ErrorCards issues={issues} label="Node issues" />
        <IssueInformation issues={issues} />
      </>,
    );
    expect(html.match(/Permission denied\./g)).toHaveLength(1);
    expect(html).toContain('NodeExecutionError');
    expect(html).toContain('<h5>Cause</h5>');
    expect(html).toContain('DevicePermissionError');
    expect(html).toContain('DEVICE_PERMISSION_DENIED');
    expect(html).not.toContain('View all');
  });

  it('splits independent aggregated errors while keeping their distinct metadata', () => {
    const issues = getStepIssues({
      ...step,
      error: {
        name: 'AggregateError',
        message: 'Cleanup failed.',
        errors: ['DEVICE_RELEASE_FAILED', 'SESSION_RELEASE_FAILED'].map(
          (code) => ({ name: 'Error', code, message: 'Cleanup failed.' }),
        ),
      },
    });
    const html = renderToStaticMarkup(
      <>
        <ErrorCards issues={issues} label="Node issues" />
        <IssueInformation issues={issues} />
      </>,
    );
    expect(html.split('<details')[0].match(/Cleanup failed\./g)).toHaveLength(
      1,
    );
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.error?.code)).toEqual([
      'DEVICE_RELEASE_FAILED',
      'SESSION_RELEASE_FAILED',
    ]);
    expect(html).toContain('View all 2 issues');
    expect(html).not.toContain('Related errors');
    expect(html).toContain('DEVICE_RELEASE_FAILED');
    expect(html).not.toContain('SESSION_RELEASE_FAILED');
  });

  it('shows the primary issue and opens all errors and warnings in a drawer without counting info', () => {
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Node issues"
        issues={[
          ...getStepIssues(step),
          {
            id: 'second',
            severity: 'error',
            code: 'ANOTHER_ERROR',
            message: 'Another independent error.',
          },
          {
            id: 'warning',
            severity: 'warning',
            code: 'PARTIAL_EVIDENCE',
            message: 'Evidence is incomplete.',
          },
          {
            id: 'info',
            severity: 'info',
            code: 'NOTE',
            message: 'Optional note.',
          },
        ]}
      />,
    );
    expect(html).toContain('View all 3 issues');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/class="runner-error-card /g)).toHaveLength(1);
    expect(html).not.toContain('Another independent error.');
    expect(html).not.toContain('Evidence is incomplete.');
    expect(html).not.toContain('Optional note.');
    expect(html).toContain('<summary>details</summary>');
    expect(html).not.toContain(' open=""');
  });

  it('keeps partial metrics metadata behind technical details', () => {
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Other issues"
        issues={[
          {
            id: 'metrics',
            severity: 'warning',
            code: 'PARTIAL_MODEL_METRICS',
            label: 'Run · Model metrics',
            message: 'Legacy metric message.',
            context: {
              status: 'partial',
              expectedExecutionCount: 3,
              capturedExecutionCount: 3,
              reasons: [
                'An operation was still running at capture.',
                'An operation was still running at capture.',
              ],
            },
          },
        ]}
      />,
    );
    expect(html).toContain(
      '<strong>Model usage totals are incomplete and may be higher than shown</strong>',
    );
    expect(html).toContain('may undercount actual usage');
    expect(
      html.match(/An operation was still running at capture\./g),
    ).toHaveLength(1);
    expect(html).toContain('expectedExecutionCount');
    expect(html).not.toContain('Legacy metric message.');
    expect(html).toContain('<summary>details</summary>');
    expect(html).not.toContain(' open=""');
  });

  it('shows at most two distinct reasons before a closed disclosure', () => {
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Other issues"
        issues={[
          {
            id: 'metrics',
            severity: 'warning',
            code: 'PARTIAL_MODEL_METRICS',
            message: 'Partial metrics.',
            context: {
              reasons: [
                'First reason.',
                'Second reason.',
                'First reason.',
                'Third reason.',
                'Fourth reason.',
              ],
            },
          },
        ]}
      />,
    );
    const [visible, hidden] = html.split(
      '<details class="runner-error-reasons-more">',
    );
    expect(visible).toContain('First reason.');
    expect(visible).toContain('Second reason.');
    expect(visible).not.toContain('Third reason.');
    expect(hidden).toContain('Show 2 more reasons');
    expect(hidden).toContain('Third reason.');
    expect(hidden).toContain('Fourth reason.');
    expect(html.match(/First reason\./g)).toHaveLength(1);
    expect(html).not.toContain(' open=""');
  });

  it('keeps a message-only card compact without empty technical details', () => {
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Node issues"
        issues={[
          {
            id: 'plain',
            severity: 'error',
            code: 'CUSTOM_ERROR',
            message: 'Device disconnected.',
          },
        ]}
      />,
    );
    expect(html).toContain('<strong>Device disconnected.</strong>');
    expect(html).not.toContain('runner-error-body');
    expect(html).not.toContain('<summary>details</summary>');
  });

  it('links blocked nodes to their cause without repeating that cause text', () => {
    const blocked: TestRunReportStep = {
      id: 'planned:0',
      node: 'map.preview',
      phase: 'steps',
      stepIndex: 0,
      status: 'not-run',
      continuedAfterError: false,
      blockedBy: step.id,
      notRunReason: 'Document setup failed: Unexpected title.',
    };
    const issues = getStepIssues(blocked);
    const html = renderToStaticMarkup(
      <EvidenceTabs
        step={blocked}
        issues={issues}
        navigableStepIds={new Set([step.id])}
        tab="io"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('Blocked by a preceding step.');
    expect(html).toContain('href="#runner-step=setup%3A1"');
    expect(html).not.toContain('Unexpected title.');
    expect(html).not.toContain('runner-error-card');
  });

  it('keeps event facts without repeating the node error and its cause chain', () => {
    const html = renderToStaticMarkup(
      <EvidenceTabs
        step={{
          ...step,
          operations: {
            capturedAt: step.endedAt!,
            events: [
              {
                operationId: 'op',
                operationKind: 'node',
                kind: 'settled',
                at: step.endedAt!,
                status: 'failed',
                error: step.error,
              },
            ],
          },
        }}
        tab="logs"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('title="settled:');
    expect(html).toContain('>Finished</span>');
    expect(html).not.toContain('Unexpected title.');
    expect(html).not.toContain('Debugger Tool');
  });

  it('keeps operation ordering, exact timestamps and pending failures in the event table', () => {
    const html = renderToStaticMarkup(
      <EvidenceTabs
        step={{
          ...step,
          operations: {
            capturedAt: step.endedAt,
            events: [
              {
                operationId: 'op',
                operationKind: 'resource',
                kind: 'cancel-requested',
                at: step.startedAt,
              },
              {
                operationId: 'op',
                operationKind: 'resource',
                kind: 'runner-returned',
                at: step.endedAt,
                status: 'failed',
                pending: true,
              },
            ],
          },
        }}
        tab="logs"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('<table aria-label="Operation events">');
    expect(html).toContain('<th scope="col">Time</th>');
    expect(html).toContain(`dateTime="${step.startedAt}"`);
    expect(html).toContain('title="resource:');
    expect(html).toContain('Operation ID: op');
    expect(html).toContain('Run Agent operation</span>');
    expect(html.indexOf('cancel-requested')).toBeLessThan(
      html.indexOf('runner-returned'),
    );
    expect(html).toContain('Execution still running');
    expect(html).toContain('>pending</span>');
    expect(html).toContain('>failed</span>');
    expect(html).toContain('<span class="runner-muted">-</span>');
  });

  it('explains every operation and event while preserving raw names in hover hints', () => {
    const examples: Array<{
      operationKind: TestRunReportOperationEvent['operationKind'];
      kind: TestRunReportOperationEvent['kind'];
      operationLabel: string;
      eventLabel: string;
    }> = [
      {
        operationKind: 'node',
        kind: 'started',
        operationLabel: 'Run step',
        eventLabel: 'Started',
      },
      {
        operationKind: 'acquisition',
        kind: 'settled',
        operationLabel: 'Get Agent',
        eventLabel: 'Finished',
      },
      {
        operationKind: 'resource',
        kind: 'runner-returned',
        operationLabel: 'Run Agent operation',
        eventLabel: 'Result returned',
      },
      {
        operationKind: 'readiness',
        kind: 'cancel-requested',
        operationLabel: 'Wait for app readiness',
        eventLabel: 'Cancellation requested',
      },
      {
        operationKind: 'cleanup',
        kind: 'cleanup-deferred',
        operationLabel: 'Clean up resources',
        eventLabel: 'Cleanup postponed',
      },
    ];
    const html = renderToStaticMarkup(
      <EvidenceTabs
        step={{
          ...step,
          operations: {
            capturedAt: step.endedAt,
            events: examples.map(({ operationKind, kind }) => ({
              operationId: `${operationKind}-operation`,
              operationKind,
              kind,
              at: step.startedAt,
            })),
          },
        }}
        tab="logs"
        onChange={() => {}}
      />,
    );
    for (const example of examples) {
      expect(html).toContain(`title="${example.operationKind}:`);
      expect(html).toContain(
        `Operation ID: ${example.operationKind}-operation`,
      );
      expect(html).toContain(`${example.operationLabel}</span>`);
      expect(html).toContain(`title="${example.kind}:`);
      expect(html).toContain(`>${example.eventLabel}</span>`);
      expect(html).not.toContain(`>${example.operationKind}</`);
      expect(html).not.toContain(`>${example.kind}</`);
    }
    expect(html).toContain('An existing Agent may be reused.');
    expect(html).toContain('including any Agent operations.');
    expect(html).toContain('The underlying operation may still be running.');
    expect(html).not.toContain('<small>Execution still running</small>');
  });

  it('retains start and completion facts when no operation snapshot exists', () => {
    const html = renderToStaticMarkup(
      <EvidenceTabs step={step} tab="logs" onChange={() => {}} />,
    );
    expect(html).toContain('Step started: aiAssert');
    expect(html).toContain('Step ended in 1.00 s');
    expect(html).toContain(`dateTime="${step.endedAt}"`);
    expect(html).toContain('>failed</span>');
    expect(html).toContain('Run step</span>');
    expect(html).toContain('>Started</span>');
    expect(html).toContain('>Finished</span>');
  });

  it('shows the same empty state for uncaptured events and steps that did not run', () => {
    const emptySteps: TestRunReportStep[] = [
      { ...step, operations: { capturedAt: step.endedAt, events: [] } },
      {
        id: 'not-run',
        node: 'aiAssert',
        phase: 'steps',
        stepIndex: 0,
        status: 'not-run',
        continuedAfterError: false,
        notRunReason: 'Blocked by failure.',
      },
    ];
    for (const empty of emptySteps) {
      const html = renderToStaticMarkup(
        <EvidenceTabs step={empty} tab="logs" onChange={() => {}} />,
      );
      expect(html).toContain('runner-events-empty');
      expect(html).toContain('No operation events were recorded.');
      expect(html).not.toContain('<table');
      expect(html).not.toContain('Step started');
    }
  });

  it('shows plan configuration on the node without duplicating identical input', () => {
    const html = renderToStaticMarkup(
      <EvidenceTabs
        step={step}
        plannedStep={{
          id: 'plan:setup:1',
          phase: 'beforeAll',
          stepIndex: 1,
          node: 'aiAssert',
          input: step.input!,
          inputMode: 'template',
          timeoutMs: 60000,
          continueOnError: false,
        }}
        tab="io"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('Configuration');
    expect(html).toContain('beforeAll');
    expect(html).toContain('1m 0s');
    expect(html).not.toContain('Planned input');
    expect(html.match(/Check the title/g)).toHaveLength(1);
  });
});
