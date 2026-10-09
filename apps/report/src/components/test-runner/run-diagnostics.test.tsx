import type { TestRunReportDump, TestRunReportStep } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunDiagnostics } from './run-diagnostics';
import { getRunDiagnostics } from './run-diagnostics-model';
import { ScopeOutcome } from './scope-outcome';
import { SingleCaseRunInfo } from './single-case-run-info';

const at = '2026-10-08T10:00:00.000Z';
const time = { startedAt: at, endedAt: at, durationMs: 0 };
const failed = (id: string, node: string, code: string): TestRunReportStep => ({
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

describe('grouped run diagnostics', () => {
  it('opens infrastructure failures before secondary evidence warnings', () => {
    const dump = fixture();
    dump.projects[0].documents[0].cases[0].attempts[0].steps = [];
    dump.diagnostics = [
      {
        level: 'warning',
        code: 'agent-detail-unavailable',
        message: 'No stable reference.',
      },
      {
        level: 'warning',
        code: 'run-infrastructure-error',
        message: 'Report publication failed.',
      },
    ];
    const html = renderToStaticMarkup(<RunDiagnostics dump={dump} />);
    expect(html).toMatch(
      /<details open=""><summary>Run stopped by an infrastructure error/,
    );
    expect(html.indexOf('Run stopped by an infrastructure error')).toBeLessThan(
      html.indexOf('Executed steps have no stable Agent reference'),
    );
  });
  it('keeps independent failures separate and groups explicitly linked consequences', () => {
    const dump = fixture();
    const project = dump.projects[0];
    const document = project.documents[0];
    const attempt = document.cases[0].attempts[0];
    for (let index = 0; index < 23; index++)
      attempt.steps.push({
        id: `blocked-${index}`,
        phase: 'steps',
        stepIndex: index + 3,
        node: 'aiAssert',
        status: 'not-run',
        continuedAfterError: true,
        blockedBy: 'timeout-one',
        notRunReason: 'Agent operation is still running.',
      });
    const cleanup = {
      status: 'pending' as const,
      capturedAt: at,
      blockingOperations: [{ operationId: 'operation', stepId: 'timeout-one' }],
    };
    attempt.cleanup = { ...cleanup, operationId: 'case-cleanup' };
    document.cleanup = { ...cleanup, operationId: 'document-cleanup' };
    project.lifecycle = {
      status: 'failed',
      ...time,
      cleanup: { ...cleanup, operationId: 'project-cleanup' },
    };
    dump.diagnostics = Array.from({ length: 7 }, (_, index) => ({
      level: 'warning',
      code: 'agent-detail-unresolved',
      message: `Missing execution uuid-${index}`,
      scopeId: 'attempt',
      executionId: `uuid-${index}`,
      stepId: 'timeout-one',
    }));
    const diagnostics = getRunDiagnostics(dump);
    expect(diagnostics).toMatchObject({
      failedSteps: 3,
      timedOutSteps: 2,
      blockedSteps: 23,
      pendingCleanupScopes: 3,
    });
    expect(
      diagnostics.groups.filter((group) => group.category === 'execution'),
    ).toHaveLength(3);
    expect(
      diagnostics.groups.find((group) => group.category === 'blocked')?.entries,
    ).toHaveLength(23);
    expect(
      diagnostics.groups.find((group) => group.category === 'evidence')
        ?.entries,
    ).toHaveLength(7);
    expect(
      diagnostics.groups.filter((group) => group.category === 'cleanup'),
    ).toHaveLength(1);
    expect(
      diagnostics.groups.find((group) => group.category === 'cleanup')?.entries,
    ).toHaveLength(3);
    expect(diagnostics.summary).not.toContain('uuid');
    const html = renderToStaticMarkup(<RunDiagnostics dump={dump} />);
    expect(html).toContain('2 timed-out step(s)');
    expect(html).toContain('23 step(s) not executed');
    expect(html).toContain('href="#runner-step=timeout-one"');
    expect(html).toContain('(7 records)');
    expect(html).not.toContain('Project teardown failed');
  });
  it('explains preparation failure even when no case failed or started', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.beforeAll = [
      {
        ...failed('setup-failure', 'aiAssert', 'NODE_EXECUTION_ERROR'),
        phase: 'beforeAll',
        stepIndex: 6,
      },
    ];
    document.cases[0].status = 'not-run';
    document.cases[0].attempts = [];
    dump.summary.failed = 0;
    dump.summary.notRun = 1;
    const html = renderToStaticMarkup(<SingleCaseRunInfo dump={dump} />);
    expect(html).toContain('1 preparation failure(s)');
    expect(html).toContain('1 case(s) did not start');
    expect(html).toContain('beforeAll 7: aiAssert');
    expect(html).toContain('href="#runner-step=setup-failure"');
  });
  it('shows successful authored steps alongside failed cleanup and a stopped retry budget', () => {
    const html = renderToStaticMarkup(
      <ScopeOutcome
        label="Case attempt 1"
        value={{
          executionStatus: 'success',
          phases: {
            steps: {
              status: 'success',
              executedStepCount: 5,
              plannedStepCount: 5,
            },
          },
          cleanup: {
            status: 'failed',
            capturedAt: at,
            error: {
              name: 'Error',
              message: '<release failed>',
              cause: { name: 'Error', message: 'connection closed' },
            },
          },
          retryDecision: {
            scope: 'case',
            retryCount: 3,
            attemptIndex: 0,
            decision: 'stop',
            reason: 'cleanup-failed',
          },
        }}
      />,
    );
    expect(html).toContain('Authored execution: success');
    expect(html).toContain('Resource cleanup: failed');
    expect(html).toContain(
      'Budget: 3 additional attempts; attempts completed: 1',
    );
    expect(html).toContain('connection closed');
    expect(html).not.toContain('<release failed>');
  });
  it('counts file attempt history once instead of counting the final hooks twice', () => {
    const dump = fixture();
    const document = dump.projects[0].documents[0];
    document.cases[0].attempts = [];
    const step = {
      ...failed('beforeAll-error', 'aiAssert', 'NODE_EXECUTION_ERROR'),
      phase: 'beforeAll' as const,
    };
    document.beforeAll = [step];
    const { cases: _cases, attempts: _attempts, ...scope } = document;
    document.attempts = [{ ...scope, attemptIndex: 0 }];
    expect(getRunDiagnostics(dump).failedSteps).toBe(1);
  });
  it('only links cleanup blockers with a browsable step in the workspace', () => {
    const html = renderToStaticMarkup(
      <ScopeOutcome
        label="Case attempt 1"
        navigableStepIds={new Set(['known-step'])}
        value={{
          cleanup: {
            status: 'pending',
            capturedAt: at,
            blockingOperations: [
              { operationId: 'known-operation', stepId: 'known-step' },
              { operationId: 'foreign-operation', stepId: 'foreign-step' },
            ],
          },
        }}
      />,
    );
    expect(html).toContain('href="#runner-step=known-step"');
    expect(html).not.toContain('href="#runner-step=foreign-step"');
    expect(html).toContain('this snapshot does not update');
  });
});
