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
): StepRunResult => ({
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

const output = () => ({ log: vi.fn(), error: vi.fn() });

beforeEach(() => vi.resetAllMocks());

describe('Test CLI failure diagnostics', () => {
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

      expect(await runTestCli([], io)).toBe(1);
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

    expect(await runTestCli([], io)).toBe(1);
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

    expect(await runTestCli([], io)).toBe(1);
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
    recovered.steps = [
      failedStep('steps', failure('recovered attempt failure')),
    ];
    const successful: CaseRunResult = {
      ...recovered,
      status: 'success',
      steps: [
        {
          ...recovered.steps[0],
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

    expect(await runTestCli([], io)).toBe(1);
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
      'midscene-test: 1/1 cases passed, 0 failed, 0 not run',
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

    expect(await runTestCli([], io)).toBe(1);
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

    expect(await runTestCli([], io)).toBe(0);
    expect(io.error).not.toHaveBeenCalled();
  });
});
