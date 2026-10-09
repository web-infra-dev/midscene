import type { TestRunReportDump, TestRunReportStep } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorCards } from './error-card';
import { IssueInformation } from './issue-information';
import { collectReportIssues, getStepIssues } from './issues';

const at = '2026-10-08T10:00:00.000Z';
const time = { startedAt: at, endedAt: at, durationMs: 0 };
const failed = (
  id: string,
  node: string,
  code: string,
): Extract<TestRunReportStep, { status: 'failed' | 'success' }> => ({
  id,
  node,
  phase: 'steps',
  stepIndex: 0,
  status: 'failed',
  continuedAfterError: true,
  ...time,
  error: { name: 'Error', code, message: 'independent failure' },
});
const fixture = (): TestRunReportDump => ({
  schemaVersion: 1,
  kind: 'test-runner',
  runId: 'run',
  status: 'failed',
  ...time,
  summary: {
    total: 1,
    passed: 0,
    failed: 1,
    notRun: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  },
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
  projects: [
    {
      projectId: 'pia',
      name: 'pia-ios',
      status: 'failed',
      retry: 3,
      collectionErrors: [],
      documents: [
        {
          documentId: 'document',
          sourcePath: 'cases/pia.yaml',
          status: 'failed',
          beforeAll: [],
          afterAll: [],
          cases: [
            {
              caseId: 'case',
              name: 'Validate SSR',
              caseIndex: 0,
              status: 'failed',
              attempts: [
                {
                  attemptId: 'attempt',
                  attemptIndex: 0,
                  status: 'failed',
                  ...time,
                  beforeEach: [],
                  afterEach: [],
                  steps: [
                    failed('timeout-one', 'aiAct', 'STEP_TIMEOUT'),
                    failed('timeout-two', 'aiAct', 'STEP_TIMEOUT'),
                    failed('sms', 'sendCode', 'NODE_EXECUTION_ERROR'),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('node and non-node error cards', () => {
  it('explains a setup assertion failure without treating other aiAssert errors as assertion mismatches', () => {
    const setup: TestRunReportStep = {
      ...failed('setup', 'aiAssert', 'NODE_EXECUTION_ERROR'),
      phase: 'beforeAll',
      error: {
        name: 'NodeExecutionError',
        message: 'Node failed: Unexpected title.',
        cause: { name: 'AssertionError', message: 'Unexpected title.' },
      },
    };
    const renderIssues = (step: TestRunReportStep) =>
      renderToStaticMarkup(
        <ErrorCards issues={getStepIssues(step)} label="Node issues" />,
      );
    expect(renderIssues(setup)).toContain(
      'Document setup assertion failed; cases could not start',
    );
    const html = renderIssues({
      ...setup,
      error: { name: 'Error', message: 'Model connection closed.' },
    });
    expect(html).toContain('Document setup failed; cases could not start');
    expect(html).not.toContain('assertion failed');
  });

  it('counts only explicitly linked unexecuted steps in the timeout title', () => {
    const dump = fixture();
    dump.projects[0].documents[0].cases[0].attempts[0].steps = [
      failed('timeout', 'aiAct', 'STEP_TIMEOUT'),
      ...Array.from(
        { length: 4 },
        (_, stepIndex): TestRunReportStep => ({
          id: `blocked:${stepIndex}`,
          node: 'aiAssert',
          phase: 'steps',
          stepIndex: stepIndex + 1,
          status: 'not-run',
          continuedAfterError: false,
          notRunReason: 'The earlier operation did not finish.',
          blockedBy: stepIndex < 3 ? 'timeout' : 'another-step',
        }),
      ),
    ];
    const issues = collectReportIssues(dump);
    const html = renderToStaticMarkup(
      <ErrorCards issues={issues.nodes.get('timeout')!} label="Node issues" />,
    );
    expect(html).toContain('Step timed out; 3 later steps not run');
    expect(html).not.toContain('4 later steps');
  });

  it('keeps independent node failures out of the non-node list', () => {
    const issues = collectReportIssues(fixture());
    expect(
      [...issues.nodes.values()].filter((values) =>
        values.some((issue) => issue.severity === 'error'),
      ),
    ).toHaveLength(3);
    expect(issues.others.filter((issue) => issue.severity === 'error')).toEqual(
      [],
    );
  });
  it('moves cleanup waiting facts to the known blocking node', () => {
    const dump = fixture();
    const attempt = dump.projects[0].documents[0].cases[0].attempts[0];
    attempt.cleanup = {
      status: 'pending',
      capturedAt: at,
      blockingOperations: [{ operationId: 'op', stepId: 'timeout-one' }],
    };
    attempt.pendingOperations = [{ operationId: 'op', stepId: 'timeout-one' }];
    const issues = collectReportIssues(dump);
    expect(issues.nodes.get('timeout-one')).toHaveLength(2);
    expect(
      issues.others.filter((issue) => issue.code === 'OPERATION_PENDING'),
    ).toHaveLength(0);
    const cleanup = issues.nodes
      .get('timeout-one')!
      .find((issue) => issue.code === 'RESOURCE_CLEANUP_PENDING')!;
    expect(cleanup).toMatchObject({
      severity: 'warning',
      scopeId: 'attempt',
      relatedStepIds: ['timeout-one'],
    });
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Node issues"
        issues={[cleanup]}
        navigableStepIds={new Set(['timeout-one'])}
      />,
    );
    expect(html).toContain('href="#runner-step=timeout-one"');
    expect(html).toContain('is-warning');
  });
  it('renders evidence warnings as cards and keeps supporting details in Information', () => {
    const step = {
      ...failed('step', 'aiAct', 'STEP_TIMEOUT'),
      evidenceCollection: {
        status: 'partial' as const,
        errors: [{ name: 'Error', message: 'Snapshot write failed.' }],
      },
    };
    const dump = fixture();
    dump.projects[0].documents[0].cases[0].attempts[0].steps = [step];
    dump.diagnostics = [
      {
        level: 'warning',
        code: 'agent-source-unavailable',
        stepId: 'step',
        message: 'Report collection: Snapshot write failed.',
        error: step.evidenceCollection.errors[0],
      },
    ];
    const issues = collectReportIssues(dump).nodes.get('step')!;
    expect(issues).toHaveLength(2);
    const html = renderToStaticMarkup(
      <ErrorCards issues={issues} label="Node issues" />,
    );
    expect(html).toContain('STEP_TIMEOUT');
    expect(html).toContain('Show 1 more issue');
    expect(html.match(/Snapshot write failed\./g)).toHaveLength(1);
    const information = renderToStaticMarkup(
      <IssueInformation issues={issues} />,
    );
    expect(information).not.toContain('Snapshot write failed.');
    expect(information).toContain('STEP_TIMEOUT');
    expect(html).not.toContain(' open=""');
  });
  it('does not treat missing evidence as a failed successful action', () => {
    const step = {
      ...failed('ok', 'aiAct', 'unused'),
      status: 'success' as const,
      error: undefined,
      agentDetailDiagnostic: 'Execution reference unresolved.',
    };
    const issues = getStepIssues(step);
    expect(issues).toMatchObject([{ severity: 'warning' }]);
    expect(step.status).toBe('success');
    expect(
      renderToStaticMarkup(<ErrorCards issues={issues} label="Node issues" />),
    ).not.toContain('runner-error-more');
  });
  it('does not manufacture missing-reference warnings for not-run nodes', () => {
    const issues = getStepIssues({
      id: 'blocked',
      node: 'aiAct',
      phase: 'steps',
      stepIndex: 0,
      status: 'not-run',
      notRunReason: 'Agent occupied.',
      blockedBy: 'timeout-one',
      continuedAfterError: true,
      agentDetailDiagnostic: 'No reference.',
    });
    expect(issues).toMatchObject([{ code: 'NOT_RUN', severity: 'info' }]);
    expect(issues).toHaveLength(1);
  });
  it('routes reliable diagnostics to nodes and retains unowned diagnostics', () => {
    const dump = fixture();
    dump.diagnostics = [
      {
        level: 'warning',
        code: 'agent-detail-unresolved',
        stepId: 'timeout-one',
        scopeId: 'attempt',
        message: 'Missing execution.',
      },
      {
        level: 'warning',
        code: 'agent-detail-unavailable',
        stepId: 'foreign',
        scopeId: 'unknown-scope',
        message: 'Unowned reference.',
      },
    ];
    const issues = collectReportIssues(dump);
    expect(issues.nodes.get('timeout-one')).toHaveLength(2);
    expect(
      issues.others.some((issue) => issue.message === 'Missing execution.'),
    ).toBe(false);
    expect(
      issues.others.some((issue) => issue.message === 'Unowned reference.'),
    ).toBe(true);
  });
  it('does not duplicate reference messages or file attempt hooks', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    const step = {
      ...failed('setup', 'aiAssert', 'NODE_EXECUTION_ERROR'),
      phase: 'beforeAll' as const,
      agentDetailDiagnostic: 'Missing reference.',
    };
    document.beforeAll = [step];
    const { cases: _cases, attempts: _attempts, ...scope } = document;
    document.attempts = [{ ...scope, attemptIndex: 0 }];
    dump.diagnostics = [
      {
        level: 'warning',
        code: 'agent-detail-unresolved',
        stepId: 'setup',
        message: 'Missing execution UUID.',
      },
    ];
    const issues = collectReportIssues(dump);
    expect(issues.nodes.get('setup')).toHaveLength(2);
  });
  it('preserves cleanup errors, retry decisions, and safe cause details', () => {
    const dump = fixture();
    const attempt = dump.projects[0].documents[0].cases[0].attempts[0];
    attempt.executionStatus = 'success';
    attempt.cleanup = {
      status: 'failed',
      capturedAt: at,
      error: {
        name: 'Error',
        message: '<release failed>',
        cause: { name: 'Error', message: 'connection closed' },
      },
    };
    attempt.retryDecision = {
      scope: 'case',
      retryCount: 3,
      attemptIndex: 0,
      decision: 'stop',
      reason: 'cleanup-failed',
    };
    const html = renderToStaticMarkup(
      <ErrorCards
        issues={collectReportIssues(dump).others}
        label="Other issues"
        showDetails
      />,
    );
    expect(html).not.toContain('authored execution');
    expect(html.match(/&lt;release failed&gt;/g)).toHaveLength(1);
    expect(html).toContain('1 of 4 allowed attempts ran.');
    expect(html).toContain('connection closed');
    expect(html).not.toContain('<release failed>');
  });
  it('only links known blockers and preserves all distinct scope records', () => {
    const dump = fixture();
    const attempt = dump.projects[0].documents[0].cases[0].attempts[0];
    attempt.cleanup = {
      status: 'pending',
      capturedAt: at,
      blockingOperations: [
        { operationId: 'known', stepId: 'timeout-one' },
        { operationId: 'foreign', stepId: 'foreign-step' },
      ],
    };
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Other issues"
        issues={collectReportIssues(dump).others}
        navigableStepIds={new Set(['timeout-one'])}
      />,
    );
    expect(html).toContain('href="#runner-step=timeout-one"');
    expect(html).not.toContain('href="#runner-step=foreign-step"');
  });
  it('does not merge independent scope errors merely because their messages match', () => {
    const dump = fixture();
    const error = { name: 'Error', message: 'identical failure' };
    dump.projects[0].lifecycle = {
      status: 'failed',
      ...time,
      setupError: error,
    };
    dump.diagnostics = [
      {
        code: 'run-infrastructure-error',
        level: 'error',
        scopeId: 'different-scope',
        message: error.message,
        error,
      },
    ];
    expect(
      collectReportIssues(dump).others.filter(
        (issue) => issue.message === error.message,
      ),
    ).toHaveLength(2);
  });

  it('keeps early retry stops on the blocking node and ignores normal retry decisions', () => {
    const dump = fixture();
    const attempt = dump.projects[0].documents[0].cases[0].attempts[0];
    attempt.cleanup = {
      status: 'pending',
      capturedAt: at,
      blockingOperations: [{ operationId: 'op', stepId: 'timeout-one' }],
    };
    attempt.retryDecision = {
      scope: 'case',
      retryCount: 3,
      attemptIndex: 0,
      decision: 'stop',
      reason: 'cleanup-pending',
    };
    const issues = collectReportIssues(dump);
    expect(issues.nodes.get('timeout-one')).toContainEqual(
      expect.objectContaining({
        code: 'RETRY_STOPPED',
        severity: 'warning',
        title: 'Case retries stopped because resource cleanup is still pending',
      }),
    );
    expect(issues.others.some((issue) => issue.code === 'RETRY_STOPPED')).toBe(
      false,
    );
    for (const reason of [
      'passed',
      'budget-exhausted',
      'attempt-failed',
    ] as const) {
      attempt.retryDecision.reason = reason;
      expect(
        [...collectReportIssues(dump).nodes.values()]
          .flat()
          .some((issue) => issue.code === 'RETRY_STOPPED'),
      ).toBe(false);
    }
  });

  it('renders nothing for an empty list', () => {
    expect(
      renderToStaticMarkup(<ErrorCards issues={[]} label="Node issues" />),
    ).toBe('');
  });
});
