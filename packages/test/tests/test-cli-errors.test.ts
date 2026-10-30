import type {
  TestRunReportDocumentPlan,
  TestRunReportPlannedStep,
} from '@midscene/core';
import { WorkflowExecutionFailure } from '@midscene/core/internal/test-runner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCreateCommand } from '../src/cli/create-command';
import { runTestCli } from '../src/cli/test-command';
import { runTestProject } from '../src/cli/test-project-runner';
import type { TestProjectRunResult } from '../src/cli/types';
import type {
  CaseRunResult,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '../src/engine/types';
import { WorkflowError } from '../src/errors';

vi.mock('../src/cli/create-command', () => ({ runCreateCommand: vi.fn() }));
vi.mock('../src/cli/test-project-runner', () => ({
  runTestProject: vi.fn(),
  discoverTestConfig: vi.fn(),
  DEFAULT_TEST_FILE_SELECTION: { include: ['**/*.{yaml,yml}'] },
}));
// Summary output is covered separately; diagnostic fixtures must not publish it.
vi.mock('../src/cli/github-reporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cli/github-reporter')>()),
  writeGitHubSummary: vi.fn(),
}));

const timing = {
  startedAt: '2026-10-08T00:00:00.000Z',
  endedAt: '2026-10-08T00:00:00.001Z',
  durationMs: 1,
};

const failedResult = (): TestProjectRunResult => ({
  ...timing,
  schemaVersion: 3,
  runId: 'run',
  status: 'failed',
  exitCode: 1,
  resultDir: '/results',
  summaryPath: '/results/summary.json',
  reportDir: '/results/report',
  summary: {
    total: 1,
    passed: 0,
    failed: 1,
    notRun: 0,
    passedAfterRetry: 0,
    finalPassRate: 0,
    firstPassRate: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  },
  projects: [],
  cases: [],
  documents: [],
  collectionErrors: [],
});

const failure = (message: string): WorkflowError => {
  const cause = new Error(`original ${message}`);
  cause.stack = `Error: original ${message}\n    at user-config.ts:42:5`;
  return new WorkflowError(message, { cause });
};

const failedStep = (
  phase: StepRunResult['phase'],
  error: WorkflowError,
): StepRunResult & { status: 'failed' } => ({
  ...timing,
  phase,
  stepIndex: 0,
  node: 'test.fail',
  input: {},
  meta: { continueOnError: false },
  status: 'failed',
  continuedAfterError: false,
  error,
});

const failedDocument = (): WorkflowDocumentRunResult => ({
  ...timing,
  documentId: 'document',
  documentRunId: 'document-run',
  projectId: 'project',
  projectName: 'web',
  sourcePath: 'flow.yaml',
  status: 'failed',
  beforeAll: [],
  afterAll: [],
});

const failedCase = (): CaseRunResult => ({
  ...timing,
  caseId: 'case',
  runId: 'case-run',
  projectName: 'web',
  attemptIndex: 0,
  name: 'checkout',
  sourcePath: 'flow.yaml',
  caseIndex: 0,
  status: 'failed',
  beforeEach: [],
  steps: [],
  afterEach: [],
});

const plannedSteps = (
  phase: StepRunResult['phase'],
  count = 3,
): TestRunReportPlannedStep[] =>
  Array.from({ length: count }, (_, stepIndex) => ({
    id: `${phase}-${stepIndex}`,
    phase,
    stepIndex,
    node: 'test.fail',
    input: { value: {} },
    inputMode: 'resolved',
    continueOnError: false,
  }));

const documentPlan = (count = 3): TestRunReportDocumentPlan => ({
  documentId: 'document',
  sourcePath: 'flow.yaml',
  retry: { scope: 'case', count: 0 },
  beforeAll: plannedSteps('beforeAll', count),
  afterAll: plannedSteps('afterAll', count),
  cases: [
    {
      caseId: 'case',
      name: 'checkout',
      caseIndex: 0,
      selected: true,
      tags: [],
      beforeEach: plannedSteps('beforeEach', count),
      steps: plannedSteps('steps', count),
      afterEach: plannedSteps('afterEach', count),
    },
  ],
});

const output = () => ({ log: vi.fn(), error: vi.fn() });

beforeEach(() => vi.resetAllMocks());

describe('Test CLI failure diagnostics', () => {
  it.each([
    'beforeEach',
    'steps',
    'afterEach',
    'beforeAll',
    'afterAll',
  ] as const)(
    'uses the declared %s Step count when the first Step fails',
    async (phase) => {
      const result = failedResult();
      const document = failedDocument();
      document.plan = documentPlan();
      const step = failedStep(phase, failure('first Step failed'));
      if (phase === 'beforeAll' || phase === 'afterAll') {
        document[phase] = [step];
      } else {
        const run = failedCase();
        run[phase] = [step];
        result.cases = [{ ...run, documentId: document.documentId, run }];
      }
      result.documents = [document];
      vi.mocked(runTestProject).mockResolvedValue(result);
      const io = output();
      expect(await runTestCli([], io)).toBe(1);
      const diagnostic = io.error.mock.calls.flat().join('\n');
      expect(diagnostic).toContain(
        `Step     ${phase === 'steps' ? '' : `${phase} `}1/3 · test.fail`,
      );
      expect(diagnostic).not.toContain('1/1');
    },
  );

  it('resolves the failed Case by id in the project plan when no document plan is attached', async () => {
    const result = failedResult();
    const run = failedCase();
    run.caseIndex = 1;
    run.steps = [failedStep('steps', failure('first Step failed'))];
    const plan = documentPlan();
    plan.cases[0].caseIndex = 1;
    plan.cases.unshift({
      ...plan.cases[0],
      caseId: 'other-case',
      caseIndex: 0,
      selected: false,
      steps: plannedSteps('steps', 5),
    });
    const cases = [{ ...run, documentId: 'document', run }];
    result.cases = cases;
    result.projects = [
      {
        projectId: 'project',
        name: 'web',
        status: 'failed',
        retry: 0,
        fileSelection: { include: ['**/*.yaml'] },
        tagSelection: { include: [], exclude: [] },
        sourceCount: 1,
        selectedCaseCount: 1,
        filteredCaseCount: 1,
        cases,
        documents: [],
        collectionErrors: [],
        plans: [plan],
      },
    ];
    vi.mocked(runTestProject).mockResolvedValue(result);
    const io = output();
    expect(await runTestCli([], io)).toBe(1);
    expect(io.error.mock.calls[0][0]).toContain('Step     1/3 · test.fail');
  });

  it('omits the total when a failure has no execution plan', async () => {
    const result = failedResult();
    const run = failedCase();
    run.steps = [failedStep('steps', failure('first Step failed'))];
    result.cases = [{ ...run, documentId: 'document', run }];
    vi.mocked(runTestProject).mockResolvedValue(result);
    const io = output();
    expect(await runTestCli([], io)).toBe(1);
    expect(io.error.mock.calls[0][0]).toContain('Step     1 · test.fail');
    expect(io.error.mock.calls[0][0]).not.toContain('1/1');
  });

  it('passes structured Case failure context to the default reporter', async () => {
    const result = failedResult();
    const run = failedCase();
    run.attemptIndex = 1;
    const step = failedStep('steps', failure('planned final failure'));
    step.stepIndex = 6;
    step.node = 'demo.applyProjectOutcome';
    step.input = {
      outcome: 'final-failure',
      caseLabel: 'Case A',
      token: 'private-token',
    };
    step.meta.sourceLocation = { line: 45, column: 9 };
    run.steps = Array.from(
      { length: 6 },
      (_, index): StepRunResult => ({
        ...step,
        stepIndex: index,
        status: 'success' as const,
        error: undefined,
        input: { prompt: 'unrelated input marker' },
      }),
    ).concat(step);
    result.cases = [{ ...run, documentId: 'document', run }];
    result.documents = [{ ...failedDocument(), plan: documentPlan(7) }];
    vi.mocked(runTestProject).mockResolvedValue(result);
    const io = output();
    expect(await runTestCli([], io)).toBe(1);
    expect(io.error).toHaveBeenCalledTimes(1);
    const diagnostic = io.error.mock.calls[0][0];
    expect(diagnostic).toContain('FAIL [web] checkout');
    expect(diagnostic).toContain('Step     7/7 · demo.applyProjectOutcome');
    expect(diagnostic).toContain('Location flow.yaml:45');
    expect(diagnostic).toContain('Attempt  2/2');
    expect(diagnostic).toContain('Input    outcome: final-failure');
    expect(diagnostic).toContain('caseLabel: Case A');
    expect(diagnostic).toContain('token: [REDACTED]');
    expect(diagnostic).toContain('at user-config.ts:42:5');
    expect(diagnostic).not.toMatch(
      /private-token|unrelated input marker|NodeExecutionError/,
    );
  });

  it('labels document hook failures and whole-file attempts separately', async () => {
    const result = failedResult();
    const document = failedDocument();
    document.attemptIndex = 1;
    document.plan = {
      documentId: document.documentId,
      sourcePath: document.sourcePath,
      retry: { scope: 'document', count: 2 },
      beforeAll: plannedSteps('beforeAll', 1),
      cases: [],
      afterAll: [],
    };
    const step = failedStep('beforeAll', failure('hook failed'));
    step.meta.sourceLocation = { line: 3, column: 5 };
    document.beforeAll = [step];
    result.documents = [document];
    vi.mocked(runTestProject).mockResolvedValue(result);
    const io = output();
    expect(await runTestCli([], io)).toBe(1);
    const diagnostic = io.error.mock.calls[0][0];
    expect(diagnostic).toContain('FAIL [web] flow.yaml');
    expect(diagnostic).toContain('Step     beforeAll 1/1 · test.fail');
    expect(diagnostic).toContain('Location flow.yaml:3');
    expect(diagnostic).toContain('File try 2/3');
    expect(diagnostic).not.toContain('  Attempt ');
    expect(diagnostic).not.toContain('Input');
  });

  it('prints stacks and causes for create command failures', async () => {
    vi.mocked(runCreateCommand).mockRejectedValue(failure('create failed'));
    const io = output();

    expect(await runTestCli(['create'], io)).toBe(1);
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('at user-config.ts:42:5'),
    );
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('original create failed'),
    );
  });

  it.each(['plain failure', null, { message: 'object failure' }])(
    'returns a failure exit code for non-Error rejection %j',
    async (error) => {
      vi.mocked(runTestProject).mockRejectedValue(error);
      const io = output();

      expect(await runTestCli(['--reporter', 'verbose'], io)).toBe(1);
      expect(io.error).toHaveBeenCalledTimes(1);
    },
  );

  it('prints context and original stacks for collection and Case failures', async () => {
    const result = failedResult();
    result.collectionErrors = [
      {
        projectId: 'project',
        projectName: 'web',
        sourcePath: 'invalid.yaml',
        error: failure('collect failed'),
      },
    ];
    const run = failedCase();
    run.beforeEach = [failedStep('beforeEach', failure('beforeEach failed'))];
    run.steps = [failedStep('steps', failure('step failed'))];
    run.afterEach = [failedStep('afterEach', failure('afterEach failed'))];
    run.executionErrors = [failure('case callback failed')];
    run.teardownErrors = [failure('case teardown failed')];
    result.cases = [{ ...run, documentId: 'document', run }];
    vi.mocked(runTestProject).mockResolvedValue(result);
    const io = output();

    expect(await runTestCli(['--reporter', 'verbose'], io)).toBe(1);
    const diagnostics = io.error.mock.calls.flat();
    expect(diagnostics).toHaveLength(6);
    expect(diagnostics[0]).toContain('web/invalid.yaml');
    expect(diagnostics[1]).toContain(
      'web/flow.yaml / checkout / beforeEach[1]',
    );
    expect(diagnostics[2]).toContain('web/flow.yaml / checkout / steps[1]');
    expect(diagnostics[3]).toContain('web/flow.yaml / checkout / afterEach[1]');
    for (const diagnostic of diagnostics) {
      expect(diagnostic).toContain('at user-config.ts:42:5');
    }
  });

  it('prints document, project, and infrastructure failures once', async () => {
    const result = failedResult();
    const document = failedDocument();
    document.beforeAll = [failedStep('beforeAll', failure('beforeAll failed'))];
    document.afterAll = [failedStep('afterAll', failure('afterAll failed'))];
    document.executionErrors = [failure('document callback failed')];
    const cleanup = failure('document teardown failed');
    document.teardownErrors = [cleanup];
    document.hostErrors = [{ phase: 'report', error: failure('host failed') }];
    result.documents = [document];
    result.projects = [
      {
        projectId: 'project',
        name: 'web',
        status: 'failed',
        retry: 0,
        fileSelection: { include: ['**/*.{yaml,yml}'] },
        tagSelection: { include: [], exclude: [] },
        sourceCount: 1,
        selectedCaseCount: 1,
        filteredCaseCount: 0,
        lifecycle: {
          ...timing,
          projectName: 'web',
          status: 'failed',
          setupError: failure('setup failed'),
          teardownErrors: [failure('project teardown failed')],
        },
        cases: [],
        documents: [document],
        collectionErrors: [],
      },
    ];
    result.errors = [cleanup, failure('publication failed')];
    vi.mocked(runTestProject).mockRejectedValue(
      new WorkflowExecutionFailure(result, result.errors),
    );
    const io = output();

    expect(await runTestCli(['--reporter', 'verbose'], io)).toBe(1);
    const diagnostics = io.error.mock.calls.flat();
    expect(diagnostics).toHaveLength(8);
    for (const source of [
      'web/flow.yaml / beforeAll[1]',
      'web/flow.yaml / afterAll[1]',
      'web/flow.yaml / host report',
      'web / setup',
      'web / teardown',
      'infrastructure',
    ]) {
      expect(diagnostics).toEqual(
        expect.arrayContaining([expect.stringContaining(source)]),
      );
    }
    for (const diagnostic of diagnostics) {
      expect(diagnostic).toContain('at user-config.ts:42:5');
    }
    expect(io.log).toHaveBeenCalledWith('Summary: /results/summary.json');
  });

  it('filters recovered attempts when infrastructure failure rejects with a result', async () => {
    const result = failedResult();
    result.summary = {
      ...result.summary,
      passed: 1,
      failed: 0,
      passedAfterRetry: 1,
    };
    const recovered = failedCase();
    const recoveredStep = failedStep(
      'steps',
      failure('recovered attempt failure'),
    );
    recovered.steps = [recoveredStep];
    const successful: CaseRunResult = {
      ...recovered,
      status: 'success',
      steps: [
        {
          ...recoveredStep,
          status: 'success',
          error: undefined,
          input: { marker: 'unrelated input payload' },
          output: { data: { marker: 'unrelated output payload' } },
        },
      ],
    };
    result.cases = [
      {
        ...successful,
        documentId: 'document',
        run: successful,
        attempts: [recovered, successful],
      },
    ];
    const document = failedDocument();
    document.beforeAll = [
      failedStep('beforeAll', failure('recovered hook failure')),
    ];
    result.documents = [
      document,
      { ...document, status: 'success', beforeAll: [] },
    ];
    const publication = failure('report publication failed');
    result.errors = [publication];
    vi.mocked(runTestProject).mockRejectedValue(
      new WorkflowExecutionFailure(result, [publication, publication]),
    );
    const io = output();

    expect(await runTestCli(['--reporter', 'verbose'], io)).toBe(1);
    expect(io.error).toHaveBeenCalledTimes(1);
    const diagnostic = io.error.mock.calls[0][0];
    expect(diagnostic).toContain('midscene-test: infrastructure:');
    expect(diagnostic).toContain('at user-config.ts:42:5');
    expect(diagnostic).not.toContain('recovered attempt failure');
    expect(diagnostic).not.toContain('recovered hook failure');
    expect(diagnostic).not.toContain('unrelated input payload');
    expect(diagnostic).not.toContain('unrelated output payload');
    expect(diagnostic).not.toContain('result: {');
    expect(io.log).toHaveBeenCalledWith(
      expect.stringContaining('Cases 1 passed (1)'),
    );
  });

  it('does not repeat a raw infrastructure error already printed as a cause', async () => {
    const result = failedResult();
    const original = new Error('raw infrastructure failure');
    original.stack =
      'Error: raw infrastructure failure\n    at callback.ts:12:34';
    const contextual = new WorkflowError('document callback failed', {
      cause: original,
    });
    const document = failedDocument();
    document.executionErrors = [contextual];
    result.documents = [document];
    result.errors = [
      new WorkflowError('execution failed', { cause: original }),
    ];
    vi.mocked(runTestProject).mockRejectedValue(
      new WorkflowExecutionFailure(result, [original]),
    );
    const io = output();

    expect(await runTestCli(['--reporter', 'verbose'], io)).toBe(1);
    expect(io.error).toHaveBeenCalledTimes(1);
    expect(io.error.mock.calls[0][0]).toContain('web/flow.yaml:');
    expect(io.error.mock.calls[0][0]).toContain('at callback.ts:12:34');
  });

  it('does not report recovered Case or document attempts as final failures', async () => {
    const result = failedResult();
    result.status = 'success';
    result.exitCode = 0;
    result.summary = {
      ...result.summary,
      passed: 1,
      failed: 0,
      passedAfterRetry: 1,
      finalPassRate: 1,
    };
    const document = failedDocument();
    document.beforeAll = [failedStep('beforeAll', failure('recovered hook'))];
    result.documents = [
      document,
      { ...document, status: 'success', beforeAll: [], afterAll: [] },
    ];
    const run = failedCase();
    run.steps = [failedStep('steps', failure('recovered case'))];
    result.cases = [
      { ...run, documentId: 'document', run },
      { ...run, documentId: 'document', status: 'success' },
    ];
    vi.mocked(runTestProject).mockResolvedValue(result);
    const io = output();

    expect(await runTestCli(['--reporter', 'verbose'], io)).toBe(0);
    expect(io.error).not.toHaveBeenCalled();
  });
});
