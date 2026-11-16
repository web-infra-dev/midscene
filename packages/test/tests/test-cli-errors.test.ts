import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  TestRunReportDocumentPlan,
  TestRunReportPlannedStep,
} from '@midscene/core';
import { WorkflowExecutionFailure } from '@midscene/core/internal/test-runner';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { runCreateCommand } from '../src/cli/create-command';
import { writeGitHubSummary } from '../src/cli/github-reporter';
import * as actualPreparation from '../src/cli/prepare-test-run' with {
  rstest: 'importActual',
};
import { runPreparedTestProject } from '../src/cli/run-prepared-project';
import { runTestCli } from '../src/cli/test-command';
import type { TestProjectRunResult } from '../src/cli/types';
import type {
  CaseRunResult,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '../src/engine/types';
import { WorkflowError } from '../src/errors';

rs.mock('../src/cli/create-command', () => ({ runCreateCommand: rs.fn() }));
rs.mock('../src/cli/test-project-runner', () => ({
  discoverTestConfig: rs.fn(),
  DEFAULT_TEST_FILE_SELECTION: { include: ['**/*.{yaml,yml}'] },
}));

rs.mock('../src/cli/run-prepared-project', () => ({
  runPreparedTestProject: rs.fn(),
}));
rs.mock('../src/cli/prepare-test-run', () => ({
  ...actualPreparation,
  prepareTestRun: rs.fn(
    async (
      options: Parameters<typeof actualPreparation.prepareTestRun>[0],
    ) => ({
      projectRoot: actualPreparation.resolveRunInput(options).projectRoot,
    }),
  ),
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

const output = () => ({ log: rs.fn(), error: rs.fn() });

beforeEach(() => {
  rs.resetAllMocks();
});

describe('CLI result publication boundary', () => {
  afterEach(() => {
    rs.unstubAllEnvs();
  });

  it.each(['success', 'failed', 'infrastructure'] as const)(
    'only publishes the %s result when a caller provides a publisher',
    async (outcome) => {
      const root = mkdtempSync(join(tmpdir(), 'cli-result-publication-'));
      try {
        const summaryPath = join(root, 'github-summary.md');
        const existing = '# Existing test reporter summary\n';
        writeFileSync(summaryPath, existing);
        rs.stubEnv('GITHUB_ACTIONS', 'true');
        rs.stubEnv('GITHUB_STEP_SUMMARY', summaryPath);

        const result = failedResult();
        const run = failedCase();
        if (outcome === 'success') {
          result.status = 'success';
          result.exitCode = 0;
          result.summary = { ...result.summary, passed: 1, failed: 0 };
          run.status = 'success';
        }
        result.reportPath = join(root, 'report.html');
        result.cases = [{ ...run, documentId: 'document', run }];
        if (outcome === 'infrastructure')
          rs.mocked(runPreparedTestProject).mockRejectedValue(
            new WorkflowExecutionFailure(result, [
              failure('publication failed'),
            ]),
          );
        else rs.mocked(runPreparedTestProject).mockResolvedValue(result);

        const io = output();
        expect(await runTestCli([], io)).toBe(result.exitCode);
        expect(readFileSync(summaryPath, 'utf8')).toBe(existing);

        expect(await runTestCli([], io, writeGitHubSummary)).toBe(
          result.exitCode,
        );
        const summary = readFileSync(summaryPath, 'utf8');
        expect(summary.startsWith(existing)).toBe(true);
        expect(summary.match(/## Midscene Test/g)).toHaveLength(1);
        expect(summary).toContain(result.reportPath);
        expect(summary).toContain(result.summaryPath);
        if (outcome === 'success') {
          expect(summary).toContain('| 1 | 0 | 0 | 0 |');
          expect(summary).not.toContain('Failed: **checkout**');
        } else {
          expect(summary).toContain('| 0 | 1 | 0 | 0 |');
          expect(summary).toContain('Failed: **checkout**');
        }
        expect(io.log).toHaveBeenCalledWith(`Summary: ${result.summaryPath}`);
        expect(process.env.GITHUB_STEP_SUMMARY).toBe(summaryPath);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

describe('Test CLI single YAML file input', () => {
  afterEach(() => {
    rs.unstubAllEnvs();
  });

  it('annotates failures relative to the cwd config directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cli-single-file-'));
    try {
      writeFileSync(join(root, 'midscene.config.ts'), 'export default {};');
      mkdirSync(join(root, 'cases'));
      writeFileSync(join(root, 'cases', 'flow.yaml'), 'cases: []');
      rs.spyOn(process, 'cwd').mockReturnValue(root);
      rs.stubEnv('GITHUB_ACTIONS', 'true');
      rs.stubEnv('GITHUB_WORKSPACE', realpathSync(root));
      const result = failedResult();
      // With the root config, the runner reports source paths from the root.
      const run = { ...failedCase(), sourcePath: 'cases/flow.yaml' };
      run.steps = [failedStep('steps', failure('first Step failed'))];
      result.documents = [
        { ...failedDocument(), sourcePath: 'cases/flow.yaml' },
      ];
      result.cases = [{ ...run, documentId: 'document', run }];
      rs.mocked(runPreparedTestProject).mockResolvedValue(result);

      const io = output();
      expect(await runTestCli(['cases/flow.yaml'], io)).toBe(1);

      const annotations = io.log.mock.calls
        .flat()
        .filter((line) => String(line).startsWith('::error'));
      expect(annotations.length).toBeGreaterThan(0);
      for (const annotation of annotations)
        expect(annotation).toContain('file=cases/flow.yaml,');
    } finally {
      rs.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
      rs.mocked(runPreparedTestProject).mockResolvedValue(result);
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
    rs.mocked(runPreparedTestProject).mockResolvedValue(result);
    const io = output();
    expect(await runTestCli([], io)).toBe(1);
    expect(io.error.mock.calls[0][0]).toContain('Step     1/3 · test.fail');
  });

  it('omits the total when a failure has no execution plan', async () => {
    const result = failedResult();
    const run = failedCase();
    run.steps = [failedStep('steps', failure('first Step failed'))];
    result.cases = [{ ...run, documentId: 'document', run }];
    rs.mocked(runPreparedTestProject).mockResolvedValue(result);
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
    rs.mocked(runPreparedTestProject).mockResolvedValue(result);
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
    expect(diagnostic).toContain('token: private-token');
    expect(diagnostic).toContain('at user-config.ts:42:5');
    expect(diagnostic).not.toMatch(/unrelated input marker|NodeExecutionError/);
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
    rs.mocked(runPreparedTestProject).mockResolvedValue(result);
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
    rs.mocked(runCreateCommand).mockRejectedValue(failure('create failed'));
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
      rs.mocked(runPreparedTestProject).mockRejectedValue(error);
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
    rs.mocked(runPreparedTestProject).mockResolvedValue(result);
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
    rs.mocked(runPreparedTestProject).mockRejectedValue(
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
    rs.mocked(runPreparedTestProject).mockRejectedValue(
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
    rs.mocked(runPreparedTestProject).mockRejectedValue(
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
    rs.mocked(runPreparedTestProject).mockResolvedValue(result);
    const io = output();

    expect(await runTestCli(['--reporter', 'verbose'], io)).toBe(0);
    expect(io.error).not.toHaveBeenCalled();
  });
});
