import type { TestRunReportStep } from '@midscene/core';
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
  it('renders the core message once and keeps cause details only in Information', () => {
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
    expect(html).not.toContain('<summary>');
    const card = renderToStaticMarkup(
      <ErrorCards issues={issues} label="Node issues" />,
    );
    expect(card).not.toContain('Debugger Tool');
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

  it('keeps distinct aggregated errors even when their messages are identical', () => {
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
    expect(html.match(/Cleanup failed\./g)).toHaveLength(1);
    expect(html).toContain('Related errors (2)');
    expect(html).toContain('DEVICE_RELEASE_FAILED');
    expect(html).toContain('SESSION_RELEASE_FAILED');
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
    expect(html).not.toContain('<summary>');
  });

  it('explains partial metrics in a warning title and body without raw collection JSON', () => {
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Other issues"
        showDetails
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
    expect(html).not.toContain('expectedExecutionCount');
    expect(html).not.toContain('Legacy metric message.');
    expect(html).not.toContain('<summary>');
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
    expect(html).toContain('settled');
    expect(html).not.toContain('Unexpected title.');
    expect(html).not.toContain('Debugger Tool');
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
