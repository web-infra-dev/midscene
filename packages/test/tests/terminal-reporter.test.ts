import { stripVTControlCharacters } from 'node:util';
import type { TestRunReportDocumentPlan } from '@midscene/core';
import type {
  CaseRunOutcome,
  StepExecutionInfo,
} from '@midscene/core/internal/test-runner';
import type { ConsoleLogEntry } from '@midscene/shared/logger';
import stringWidth from 'string-width';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatConciseError } from '../src/cli/error-format';
import { TerminalReporter } from '../src/cli/terminal-reporter';
import { parseTestCliArgs } from '../src/cli/test-command';
import type {
  TestExecutionProjectRunResult,
  TestProjectRunResult,
} from '../src/cli/types';
import { NodeExecutionError } from '../src/errors';

const outcome = (
  id: string,
  status: CaseRunOutcome['status'] = 'success',
): CaseRunOutcome => ({
  caseId: id,
  caseIndex: 0,
  projectName: 'web',
  sourcePath: 'cases/shop.yaml',
  name: id,
  status,
  run:
    status === 'not-run'
      ? undefined
      : {
          caseId: id,
          runId: id,
          caseIndex: 0,
          projectName: 'web',
          sourcePath: 'cases/shop.yaml',
          name: id,
          attemptIndex: 0,
          status,
          beforeEach: [],
          steps: [],
          afterEach: [],
          startedAt: '',
          endedAt: '',
          durationMs: 1200,
        },
});

const step = (id: string, attemptIndex = 0): StepExecutionInfo => ({
  scope: 'case',
  node: 'aiAct',
  stepCount: 3,
  case: { ...outcome(id).run!, phase: 'steps', stepIndex: 1, attemptIndex },
});

const fixture = (
  mode: 'default' | 'verbose' = 'default',
  isTTY = false,
  cases = 2,
  start = true,
) => {
  let resize = () => {};
  const removeResizeListener = vi.fn();
  const io = {
    log: vi.fn(),
    error: vi.fn(),
    write: vi.fn(),
    isTTY,
    columns: 160,
    rows: 24,
    onResize: vi.fn((listener: () => void) => {
      resize = listener;
      return removeResizeListener;
    }),
  };
  const reporter = new TerminalReporter(io, mode);
  if (start)
    reporter.event({ type: 'run-start', projects: 2, documents: 2, cases });
  return { reporter, io, resize: () => resize(), removeResizeListener };
};

const projectResult = (
  name: string,
  cases: CaseRunOutcome[],
): TestExecutionProjectRunResult => ({
  projectId: name,
  name,
  status: 'success',
  retry: 0,
  fileSelection: { include: ['**/*.yaml'] },
  tagSelection: { include: [], exclude: [] },
  sourceCount: new Set(cases.map((item) => item.sourcePath)).size,
  selectedCaseCount: cases.length,
  filteredCaseCount: 0,
  cases: cases.map((item) => ({
    ...item,
    projectName: name,
    documentId: item.sourcePath,
  })),
  documents: [],
  collectionErrors: [],
});

const filePlan = (
  sourcePath: string,
  selected: boolean,
): TestRunReportDocumentPlan => ({
  documentId: sourcePath,
  sourcePath,
  retry: { scope: 'case', count: 0 },
  beforeAll: [],
  afterAll: [],
  cases: [
    {
      caseId: sourcePath,
      name: sourcePath,
      caseIndex: 0,
      selected,
      tags: [],
      beforeEach: [],
      steps: [],
      afterEach: [],
    },
  ],
});

const runResult = (
  projects: TestExecutionProjectRunResult[],
): TestProjectRunResult => ({
  schemaVersion: 3,
  runId: 'summary-test',
  startedAt: '',
  endedAt: '',
  durationMs: 1200,
  status: 'success',
  exitCode: 0,
  resultDir: '/results',
  summaryPath: '/results/summary.json',
  reportDir: '/report',
  summary: {
    total: 2,
    passed: 2,
    failed: 0,
    notRun: 0,
    passedAfterRetry: 0,
    finalPassRate: 1,
    firstPassRate: 1,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  },
  projects,
  cases: projects.flatMap((project) => project.cases),
  documents: projects.flatMap((project) => project.documents),
  collectionErrors: [],
});

const text = (io: ReturnType<typeof fixture>['io']) =>
  stripVTControlCharacters(io.log.mock.calls.flat().join('\n'));
const frame = (io: ReturnType<typeof fixture>['io']) =>
  stripVTControlCharacters(io.write.mock.calls.at(-1)?.[0] ?? '');
const endFile = (
  reporter: TerminalReporter,
  cases: CaseRunOutcome[],
  status: 'success' | 'failed' = 'success',
  retries = 0,
  file = { projectName: 'web', sourcePath: 'cases/shop.yaml' },
) => {
  reporter.event({
    type: 'document-end',
    cases,
    durationMs: 2400,
    document: {
      documentId: `${file.projectName}:${file.sourcePath}`,
      documentRunId: `${file.projectName}:${file.sourcePath}:run`,
      projectId: file.projectName,
      ...file,
      status,
      attemptIndex: retries,
      startedAt: '',
      endedAt: '',
      durationMs: 1200,
      beforeAll: [],
      afterAll: [],
    },
  });
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('terminal reporter', () => {
  it('shows Project setup and cleanup even when no file is running', () => {
    vi.useFakeTimers();
    const { reporter, io, resize } = fixture('default', true);
    reporter.event({
      type: 'project-phase',
      projectName: 'web',
      phase: 'setup',
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('❯ web · setting up 100ms');
    expect(frame(io)).not.toContain('cases/shop.yaml');
    reporter.event({
      type: 'project-phase',
      projectName: 'web',
      phase: 'running',
    });
    endFile(reporter, [outcome('finished')]);
    reporter.event({
      type: 'project-phase',
      projectName: 'web',
      phase: 'teardown',
    });
    vi.advanceTimersByTime(2100);
    resize();
    expect(frame(io)).toContain('❯ web · cleaning up 2.1s');
    expect(frame(io)).toContain('0 files running · 1 completed');
    expect(frame(io)).toContain('✓ finished 1.2s');
    reporter.event({
      type: 'project-end',
      project: projectResult('web', [outcome('finished')]),
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).not.toContain('cleaning up');
    reporter.dispose();
  });

  it.each(['setup', 'teardown'] as const)(
    'emits noninteractive heartbeats during Project %s without active files',
    (phase) => {
      vi.useFakeTimers();
      const { reporter, io } = fixture();
      reporter.event({ type: 'project-phase', projectName: 'web', phase });
      vi.advanceTimersByTime(30_000);
      expect(text(io)).toContain(
        `Still running: [web] · ${phase === 'setup' ? 'setting up' : 'cleaning up'} (30.0s)`,
      );
      reporter.event({
        type: 'project-end',
        project: projectResult('web', []),
      });
      const outputCount = io.log.mock.calls.length;
      vi.advanceTimersByTime(30_000);
      expect(io.log.mock.calls).toHaveLength(outputCount);
      reporter.dispose();
    },
  );

  it('keeps active work from every Project visible before completed summaries in a small viewport', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true, 6, false);
    io.rows = 15;
    reporter.event({ type: 'run-start', projects: 2, documents: 4, cases: 6 });
    for (const projectName of ['alpha', 'beta']) {
      const finished = {
        ...outcome(
          `${projectName}:finished`,
          projectName === 'alpha' ? 'failed' : 'success',
        ),
        projectName,
        sourcePath: 'old.yaml',
      };
      endFile(reporter, [finished], 'success', 0, finished);
      const previous = {
        ...outcome(`${projectName}:previous`),
        projectName,
        sourcePath: 'active.yaml',
      };
      reporter.event({
        type: 'document-start',
        documentId: `${projectName}:active`,
        projectName,
        sourcePath: 'active.yaml',
        cases: 2,
      });
      reporter.event({ type: 'case-end', outcome: previous });
      reporter.event({
        type: 'step-start',
        projectName,
        info: {
          scope: 'case',
          node: 'aiAct',
          stepCount: 3,
          case: {
            ...outcome(`${projectName}:running`).run!,
            projectName,
            sourcePath: 'active.yaml',
            caseIndex: 1,
            phase: 'steps',
            stepIndex: 1,
          },
        },
      });
    }
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('alpha:running');
    expect(frame(io)).toContain('beta:running');
    expect(frame(io)).toContain('1 failed');
    expect(frame(io)).not.toContain('more rows');
    reporter.dispose();
  });

  it('retains completed results immediately, folding older results before hiding active work', () => {
    vi.useFakeTimers();
    const { reporter, io, resize } = fixture('default', true);
    io.rows = 40;
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: {
        scope: 'case',
        node: 'aiAct',
        stepCount: 3,
        case: {
          ...outcome('running').run!,
          sourcePath: 'c-active.yaml',
          phase: 'steps',
          stepIndex: 1,
        },
      },
    });
    for (const path of ['a-old.yaml', 'b-new.yaml']) {
      const cases = [0, 1, 2].map((index) => ({
        ...outcome(
          `${path}:finished-${index}`,
          path === 'a-old.yaml' && index === 0 ? 'failed' : 'success',
        ),
        sourcePath: path,
        caseIndex: index,
      }));
      endFile(reporter, cases, 'success', 0, {
        projectName: 'web',
        sourcePath: path,
      });
    }
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('1 file running · 2 completed');
    expect(frame(io)).toContain('× a-old.yaml:finished-0');
    expect(frame(io)).toContain('✓ b-new.yaml:finished-2');
    io.rows = 18;
    resize();
    expect(frame(io)).toContain('c-active.yaml');
    expect(frame(io)).toContain('└─ running');
    expect(frame(io)).toContain('b-new.yaml');
    expect(frame(io)).not.toContain('a-old.yaml');
    expect(frame(io)).toContain('1 completed file · 1 failed');
    io.rows = 13;
    resize();
    expect(frame(io)).toContain('└─ running');
    expect(frame(io)).toContain('2 completed files · 1 failed');
    expect(frame(io)).not.toContain('b-new.yaml');
    expect(frame(io).split('\n').filter(Boolean).length).toBeLessThanOrEqual(
      11,
    );
    io.rows = 40;
    resize();
    expect(frame(io)).toContain('× a-old.yaml:finished-0');
    expect(frame(io)).toContain('✓ b-new.yaml:finished-2');
    reporter.dispose();
  });

  it('retains current file-attempt Case results without counting them as final, and resets them for file retry', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true);
    const first = outcome('first');
    const second = { ...outcome('second'), caseIndex: 1 };
    reporter.event({
      type: 'document-start',
      documentId: 'shop',
      projectName: 'web',
      sourcePath: first.sourcePath,
      cases: 2,
    });
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('first'),
    });
    reporter.event({
      type: 'case-progress',
      outcome: first,
      documentAttemptIndex: 0,
    });
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('second'),
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('1/2 cases');
    expect(frame(io)).toContain('✓ first 1.2s');
    expect(frame(io)).toContain('second · step');
    expect(frame(io)).toContain('Cases 0 passed (2)');
    vi.advanceTimersByTime(2000);
    expect(frame(io)).toContain('✓ first 1.2s');
    expect(frame(io).match(/first/g)).toHaveLength(1);
    reporter.event({
      type: 'document-retry',
      document: {
        documentId: 'shop',
        documentRunId: 'shop-run',
        projectId: 'web',
        projectName: 'web',
        sourcePath: first.sourcePath,
        status: 'failed',
        attemptIndex: 0,
        startedAt: '',
        endedAt: '',
        durationMs: 2400,
        beforeAll: [],
        afterAll: [],
      },
      maxAttempts: 2,
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('0/2 cases');
    expect(frame(io)).not.toContain('✓ first');
    reporter.event({
      type: 'case-progress',
      outcome: first,
      documentAttemptIndex: 1,
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('1/2 cases');
    expect(frame(io)).toContain('file retried 1x');
    expect(frame(io)).toContain('Cases 0 passed (2)');
    for (const item of [first, second])
      reporter.event({ type: 'case-end', outcome: item, documentRetries: 1 });
    endFile(reporter, [first, second], 'success', 1);
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('2/2 cases');
    expect(frame(io)).toContain('Cases 2 passed (2)');
    expect(frame(io).match(/✓ first/g)).toHaveLength(1);
    reporter.dispose();
  });

  it('groups live Projects, files and Cases, updating counts independently of retries and completed files', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true, 10, false);
    const paths = ['cases/a.yaml', 'cases/b.yaml'];
    const fileOutcome = (projectName: string, sourcePath: string) => ({
      ...outcome(`${projectName}:${sourcePath}`),
      projectName,
      sourcePath,
      name: 'checkout',
    });
    const document = (projectName: string, sourcePath: string) => ({
      documentId: `${projectName}:${sourcePath}`,
      documentRunId: `${projectName}:${sourcePath}:run`,
      projectId: projectName,
      projectName,
      sourcePath,
      status: 'success' as const,
      startedAt: '',
      endedAt: '',
      durationMs: 100,
      beforeAll: [],
      afterAll: [],
    });
    // Queued files must not appear in the live tree or running count.
    reporter.event({
      type: 'run-start',
      projects: 2,
      documents: 5,
      cases: 10,
      files: ['beta', 'alpha'].flatMap((projectName) =>
        [
          ...paths,
          ...(projectName === 'beta' ? ['cases/queued.yaml'] : []),
        ].map((sourcePath) => ({
          documentId: `${projectName}:${sourcePath}`,
          projectName,
          sourcePath,
          cases: 2,
        })),
      ),
    });
    for (const projectName of ['beta', 'alpha']) {
      for (const sourcePath of paths) {
        reporter.event({
          type: 'document-start',
          documentId: `${projectName}:${sourcePath}`,
          projectName,
          sourcePath,
          cases: 2,
        });
        reporter.event({
          type: 'step-start',
          projectName,
          info: {
            scope: 'case',
            node: 'aiAct',
            stepCount: 3,
            case: {
              ...outcome(`${projectName}:${sourcePath}`).run!,
              projectName,
              sourcePath,
              name: 'checkout',
              phase: 'steps',
              stepIndex: 1,
            },
          },
        });
      }
    }
    vi.advanceTimersByTime(100);
    let current = frame(io);
    expect(current.match(/❯ alpha · 2 files running/g)).toHaveLength(1);
    expect(current.match(/❯ beta · 2 files running/g)).toHaveLength(1);
    expect(current).not.toContain('queued.yaml');
    const alphaTree = () =>
      current.slice(current.indexOf('❯ alpha'), current.indexOf('❯ beta'));
    expect(alphaTree()).toContain(
      '   ├─ cases/a.yaml 0/2 cases\n   │  └─ checkout',
    );
    expect(alphaTree()).toContain(
      '   └─ cases/b.yaml 0/2 cases\n      └─ checkout',
    );
    const completed = fileOutcome('alpha', paths[0]);
    reporter.event({ type: 'case-end', outcome: completed });
    reporter.event({ type: 'case-end', outcome: completed });
    vi.advanceTimersByTime(100);
    current = frame(io);
    expect(alphaTree()).toContain('cases/a.yaml 1/2 cases');
    expect(current).toContain('❯ alpha · 2 files running');
    reporter.event({
      type: 'document-retry',
      document: { ...document('alpha', paths[0]), status: 'failed' },
      maxAttempts: 2,
    });
    vi.advanceTimersByTime(100);
    current = frame(io);
    expect(alphaTree()).toContain('cases/a.yaml 0/2 cases');
    expect(current).toContain('❯ alpha · 2 files running');
    for (const sourcePath of paths) {
      const first = fileOutcome('alpha', sourcePath);
      reporter.event({
        type: 'document-end',
        document: document('alpha', sourcePath),
        cases: [
          first,
          {
            ...first,
            caseId: `${first.caseId}:next`,
            caseIndex: 1,
            name: 'next Case',
          },
        ],
        durationMs: 100,
      });
      vi.advanceTimersByTime(100);
      current = frame(io);
      expect(current).toContain('❯ beta · 2 files running');
      if (sourcePath === paths[0]) {
        expect(current).toContain('❯ alpha · 1 file running');
        expect(alphaTree()).toContain('├─ ✓ cases/a.yaml 2/2 cases');
        expect(alphaTree()).toContain('└─ ✓ next Case');
        expect(alphaTree()).toContain('└─ cases/b.yaml 0/2 cases');
      } else
        expect(current).toContain('❯ alpha · 0 files running · 2 completed');
    }
    reporter.event({
      type: 'project-end',
      project: projectResult(
        'alpha',
        paths.map((path) => fileOutcome('alpha', path)),
      ),
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).not.toContain('❯ alpha');
    expect(frame(io)).toContain('❯ beta');
    expect(
      stripVTControlCharacters(io.write.mock.calls.flat().join('')),
    ).toContain('✓ alpha (2 files)');
    reporter.dispose();
  });

  it.each([
    { projects: 1, files: 4, expected: '1 projects · 4 files' },
    { projects: 3, files: 1, expected: '3 projects · 1 files' },
    {
      projects: null,
      files: null,
      expected: 'unlimited projects · unlimited files',
    },
  ])(
    'shows the independent global concurrency limits: $expected',
    ({ projects, files, expected }) => {
      const io = { log: vi.fn(), error: vi.fn() };
      const reporter = new TerminalReporter(io);
      try {
        reporter.event({
          type: 'run-start',
          projects: 3,
          documents: 6,
          cases: 9,
          maxConcurrentProjects: projects,
          maxConcurrentFiles: files,
        });
        const output = io.log.mock.calls.flat().join('\n');
        expect(output).toContain('3 projects · 6 files · 9 cases');
        expect(output).toContain(`Concurrency ${expected} (global limits)`);
        expect(output).not.toContain('concurrent projects');
      } finally {
        reporter.dispose();
      }
    },
  );

  it('keeps a peer file and its request warning live while another file retries in the same Project', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true);
    const parallelStep = (
      id: string,
      sourcePath: string,
    ): StepExecutionInfo => ({
      scope: 'case',
      node: 'aiAct',
      stepCount: 3,
      case: {
        ...outcome(id).run!,
        name: 'checkout',
        sourcePath,
        phase: 'steps',
        stepIndex: 1,
      },
    });
    const first = parallelStep('first-case', 'first.yaml');
    const second = parallelStep('second-case', 'second.yaml');
    reporter.event({ type: 'step-start', projectName: 'web', info: first });
    reporter.event({ type: 'step-start', projectName: 'web', info: second });
    reporter.console({
      type: 'warning',
      topic: 'ai',
      message: 'retry',
      scope: {
        projectName: 'web',
        sourcePath: 'second.yaml',
        caseId: 'second-case',
        caseName: 'checkout',
        runId: 'second-case',
        phase: 'steps',
        stepIndex: 1,
      },
      warning: {
        kind: 'model-request-retry',
        callId: 'peer-call',
        modelName: 'model',
        error: new Error('limited'),
        attempt: 1,
        maxAttempts: 2,
        delayMs: 2000,
      },
    });
    reporter.event({
      type: 'document-retry',
      maxAttempts: 2,
      document: {
        documentId: 'first-doc',
        documentRunId: 'first-run',
        projectId: 'web',
        projectName: 'web',
        sourcePath: 'first.yaml',
        status: 'failed',
        attemptIndex: 0,
        startedAt: '',
        endedAt: '',
        durationMs: 100,
        beforeAll: [],
        afterAll: [],
      },
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('❯ web · 2 files running');
    expect(frame(io)).toContain('└─ second.yaml');
    expect(frame(io)).toContain('⚠ model request retry');
    expect(frame(io).match(/└─ checkout/g)).toHaveLength(1);
    reporter.event({ type: 'step-end', projectName: 'web', info: second });
    vi.advanceTimersByTime(100);
    expect(frame(io)).not.toContain('⚠ model request retry');
    reporter.dispose();
  });

  it('excludes fully filtered file plans from completed results and file counts', () => {
    const { reporter, io } = fixture();
    const smoke = { ...outcome('smoke'), sourcePath: 'smoke.yaml' };
    const project = projectResult('web', [smoke]);
    project.sourceCount = 2;
    project.filteredCaseCount = 1;
    project.plans = [
      filePlan('slow.yaml', false),
      filePlan('smoke.yaml', true),
    ];
    const result = runResult([project]);
    result.summary = { ...result.summary, total: 1, passed: 1, filtered: 1 };
    reporter.finish(result);
    reporter.summary(result);
    expect(text(io)).toContain('└─ ✓ smoke.yaml (1 cases)');
    expect(text(io)).not.toContain('slow.yaml');
    expect(text(io)).toContain('Test Files 1 passed (1)');
    expect(text(io)).toContain('Cases 1 passed (1)');
  });

  it('never counts a selected file with no execution results as passed', () => {
    const { reporter, io } = fixture();
    const project = projectResult('web', []);
    project.plans = [
      filePlan('smoke.yaml', true),
      filePlan('slow.yaml', false),
    ];
    const result = runResult([project]);
    result.summary = { ...result.summary, total: 1, passed: 0, notRun: 1 };
    reporter.finish(result);
    reporter.summary(result);
    expect(text(io)).toContain('└─ – smoke.yaml');
    expect(text(io)).not.toContain('✓ smoke.yaml');
    expect(text(io)).not.toContain('slow.yaml');
    expect(text(io)).toContain('Test Files 0 passed | 1 not run (1)');
  });

  it('reports zero files when every collected Case is filtered out', () => {
    const { reporter, io } = fixture();
    const project = projectResult('web', []);
    project.plans = [filePlan('slow.yaml', false)];
    const result = runResult([project]);
    result.summary = { ...result.summary, total: 0, passed: 0, filtered: 1 };
    reporter.finish(result);
    reporter.summary(result);
    expect(text(io)).not.toContain('slow.yaml');
    expect(text(io)).toContain('Test Files 0 passed (0)');
  });

  it('uses a green run header and plain model names without blue accents', () => {
    vi.stubEnv('NO_COLOR', '');
    const io = { log: vi.fn(), error: vi.fn(), isTTY: true };
    const reporter = new TerminalReporter(io, 'verbose');
    reporter.event({
      type: 'run-start',
      projects: 1,
      documents: 1,
      cases: 1,
      configuredModels: [{ name: 'configured-model', intents: ['default'] }],
    });
    const output = io.log.mock.calls.flat().join('\n');
    expect(output).toContain('\u001b[42m');
    expect(output).toContain('\u001b[32mmidscene-test v');
    expect(output).toContain(' configured-model ');
    for (const code of [34, 36, 44, 46])
      expect(output).not.toContain(`\u001b[${code}m`);
  });

  it('separates live events and completed Project trees with one blank line between groups', () => {
    const { reporter, io } = fixture();
    reporter.console({ type: 'warning', topic: 'test', message: 'live event' });
    endFile(reporter, [outcome('first Case')]);
    reporter.finish(
      runResult([
        projectResult('web', [outcome('first Case')]),
        projectResult('mobile', [outcome('second Case')]),
      ]),
    );
    expect(text(io)).toContain(
      'WARN live event\n\n web\n   └─ ✓ cases/shop.yaml',
    );
    expect(text(io)).toContain(
      '✓ first Case 1.2s\n\n mobile\n   └─ ✓ cases/shop.yaml',
    );
    expect(text(io)).not.toContain('1.2s\n\n\n');
  });

  it.each([20, 80, 160])(
    'draws a centered failure heading with rules on both sides in %i columns',
    (columns) => {
      const { reporter, io } = fixture();
      io.columns = columns;
      reporter.failure('web / checkout', new Error('failure'));
      const result = runResult([]);
      reporter.finish(result);
      reporter.summary(result);
      const heading = text(io)
        .split('\n')
        .find((line) => line.includes('Failures 1'))!;
      expect(heading).toMatch(/^ ─+ Failures 1 ─+$/);
      expect(stringWidth(heading)).toBeLessThan(columns);
      const [, left, right] = heading.match(/^ (─+) Failures 1 (─+)$/)!;
      expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1);
    },
  );

  it.each(['default', 'verbose'] as const)(
    'prints each completed file once, with Cases in declaration order (%s)',
    (mode) => {
      const { reporter, io } = fixture(mode);
      const first = outcome('first declared');
      const second = { ...outcome('second declared'), caseIndex: 1 };
      reporter.event({ type: 'case-end', outcome: second });
      reporter.event({ type: 'case-end', outcome: first });
      expect(text(io)).not.toContain('first declared');
      endFile(reporter, [second, first]);
      endFile(reporter, [second, first]);
      reporter.finish(runResult([projectResult('web', [second, first])]));
      const output = text(io);
      expect(output.indexOf('first declared')).toBeLessThan(
        output.indexOf('second declared'),
      );
      expect(output.match(/✓ first declared/g)).toHaveLength(1);
      expect(output).toContain('\n web\n');
      expect(output).toContain('└─ ✓ cases/shop.yaml (2 cases)');
      expect(output).not.toContain('Final results');
      expect(io.write).not.toHaveBeenCalled();
    },
  );

  it('groups interleaved completions into one tree per Project in plan order, retaining final outcomes once', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true);
    const caseFor = (
      projectName: string,
      sourcePath: string,
      failed = false,
    ) => ({
      ...outcome(`${projectName}:${sourcePath}`, failed ? 'failed' : 'success'),
      projectName,
      sourcePath,
    });
    const alpha = [caseFor('alpha', 'z.yaml'), caseFor('alpha', 'a.yaml')];
    const beta = [caseFor('beta', 'z.yaml'), caseFor('beta', 'a.yaml', true)];
    beta[0].run = { ...beta[0].run!, attemptIndex: 1 };
    beta[0].attempts = [
      { ...beta[0].run, attemptIndex: 0, status: 'failed' },
      beta[0].run,
    ];
    for (const item of [alpha[1], beta[0], alpha[0], beta[1], beta[1]])
      endFile(reporter, [item], 'success', 0, item);
    expect(text(io)).not.toContain('✓ alpha:');
    const projects = [
      projectResult('alpha', alpha),
      projectResult('beta', beta),
    ];
    for (const project of projects)
      project.plans = ['z.yaml', 'a.yaml'].map((path) => filePlan(path, true));
    const result = runResult(projects);
    for (const project of projects)
      reporter.event({ type: 'project-end', project });
    reporter.finish(result);
    reporter.finish(result);
    const output = io.write.mock.calls
      .flat()
      .map(stripVTControlCharacters)
      .filter((message) => /^\n [✓×] (?:alpha|beta) \(2 files\)/.test(message))
      .join('\n');
    expect(output.match(/✓ alpha \(2 files\)/g)).toHaveLength(1);
    expect(output.match(/× beta \(2 files\)/g)).toHaveLength(1);
    const alphaTree = output.slice(
      output.indexOf('✓ alpha (2 files)'),
      output.indexOf('× beta (2 files)'),
    );
    expect(alphaTree.indexOf('z.yaml')).toBeLessThan(
      alphaTree.indexOf('a.yaml'),
    );
    expect(alphaTree).toContain('├─ ✓ z.yaml (1 cases)');
    expect(alphaTree).toContain('│  └─ ✓ alpha:z.yaml');
    expect(alphaTree).toContain('└─ ✓ a.yaml (1 cases)');
    expect(alphaTree).not.toContain('beta:');
    expect(output).toContain('└─ × a.yaml (1 cases | 1 failed)');
    expect(output).toContain('└─ × beta:a.yaml');
    expect(output).toContain('passed after retry (2 attempts)');
    for (const item of [...alpha, ...beta])
      expect(output.split(`${item.name} `)).toHaveLength(2);
  });

  it.each(['default', 'verbose'] as const)(
    'streams interleaved noninteractive files with Project context and no repeated results (%s)',
    (mode) => {
      const { reporter, io } = fixture(mode, false, 4);
      const completed = [
        ['alpha', 'a.yaml', 'success'],
        ['beta', 'b.yaml', 'failed'],
        ['alpha', 'b.yaml', 'success'],
        ['beta', 'a.yaml', 'success'],
      ].map(([projectName, sourcePath, status]) => ({
        ...outcome(
          `${projectName}:${sourcePath}`,
          status as CaseRunOutcome['status'],
        ),
        projectName,
        sourcePath,
      }));
      for (const item of completed) {
        const count = io.log.mock.calls.length;
        endFile(reporter, [item], 'success', 0, item);
        expect(io.log.mock.calls).toHaveLength(count + 1);
        const block = io.log.mock.calls.at(-1)![0];
        expect(block).toContain(`\n ${item.projectName}\n`);
        expect(block).toContain(`${item.sourcePath} (1 cases`);
        expect(block).toContain(
          `${item.status === 'failed' ? '×' : '✓'} ${item.name}`,
        );
      }
      const output = text(io);
      const projects = ['alpha', 'beta'].map((name) => {
        const project = projectResult(
          name,
          completed.filter((item) => item.projectName === name),
        );
        project.plans = ['a.yaml', 'b.yaml'].map((path) =>
          filePlan(path, true),
        );
        return project;
      });
      for (const project of projects)
        reporter.event({ type: 'project-end', project });
      reporter.finish(runResult(projects));
      expect(text(io)).toBe(output);
      expect(output.match(/\n alpha\n/g)).toHaveLength(2);
      expect(output.match(/\n beta\n/g)).toHaveLength(2);
      const positions = completed.map((item) => {
        expect(output.split(`${item.name} `)).toHaveLength(2);
        return output.indexOf(item.name);
      });
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(io.log.mock.calls.flat().join('')).not.toContain('\u001b');
      expect(io.write).not.toHaveBeenCalled();
    },
  );

  it('flushes unexecuted files in collected order and retains final recovery and not-run reasons', () => {
    const { reporter, io } = fixture();
    const recovered = { ...outcome('recovered'), sourcePath: 'z.yaml' };
    recovered.run = { ...recovered.run!, attemptIndex: 1 };
    recovered.attempts = [
      { ...recovered.run, attemptIndex: 0, status: 'failed' },
      recovered.run,
    ];
    const blocked = {
      ...outcome('blocked', 'not-run'),
      sourcePath: 'a.yaml',
      notRunReason: 'bail' as const,
    };
    const project = projectResult('web', [
      { ...recovered, status: 'failed' },
      blocked,
      recovered,
    ]);
    project.plans = ['z.yaml', 'a.yaml'].map((sourcePath) => ({
      documentId: sourcePath,
      sourcePath,
      retry: { scope: 'case', count: 1 },
      beforeAll: [],
      cases: [],
      afterAll: [],
    }));
    reporter.finish(runResult([project]));
    expect(text(io).indexOf('z.yaml')).toBeLessThan(text(io).indexOf('a.yaml'));
    expect(text(io)).toContain(
      '✓ recovered 2.4s · passed after retry (2 attempts)',
    );
    expect(text(io)).toContain('– blocked · bail');
    expect(text(io).match(/recovered/g)).toHaveLength(1);
    expect(text(io)).not.toContain('× recovered');
    expect(text(io)).not.toContain('× z.yaml');
  });

  it('marks collection errors without Cases and afterAll errors after passed Cases as failed files', () => {
    const { reporter, io } = fixture();
    const project = projectResult('web', [outcome('checkout')]);
    project.collectionErrors = [
      {
        projectId: 'web',
        projectName: 'web',
        sourcePath: 'invalid.yaml',
        error: new NodeExecutionError('parse', new Error('invalid YAML')),
      },
    ];
    endFile(reporter, [outcome('checkout')], 'failed');
    const result = runResult([project]);
    reporter.finish(result);
    reporter.summary(result);
    expect(text(io)).toContain('× cases/shop.yaml');
    expect(text(io)).toContain('✓ checkout');
    expect(text(io)).toContain('× invalid.yaml (0 cases)');
  });

  it('counts a file as failed when its lifecycle passed but a Case failed', () => {
    const { reporter, io } = fixture();
    const failed = outcome('bad assertion', 'failed');
    endFile(reporter, [failed], 'success');
    const result = runResult([projectResult('web', [failed])]);
    reporter.finish(result);
    reporter.summary(result);
    expect(text(io)).toContain('Test Files 1 failed | 0 passed (1)');
    expect(text(io)).not.toContain('Test Files 1 passed');
  });

  it('keeps model request retries distinct from Case retries and does not count attempts twice', () => {
    const { reporter, io } = fixture();
    const recovered = outcome('search');
    const failed = { ...recovered.run!, status: 'failed' as const };
    recovered.run = { ...recovered.run!, attemptIndex: 1 };
    recovered.attempts = [failed, recovered.run];
    reporter.event({
      type: 'case-attempt-end',
      attempt: failed,
      maxAttempts: 2,
    });
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('search', 1),
    });
    reporter.event({ type: 'case-end', outcome: recovered });
    reporter.event({ type: 'case-end', outcome: recovered });
    endFile(reporter, [recovered]);
    reporter.finish(runResult([projectResult('web', [recovered])]));
    expect(text(io)).toContain(
      '[web] cases/shop.yaml › search · case retry · attempt 2/2',
    );
    expect(text(io).match(/✓ search/g)).toHaveLength(1);
    expect(text(io)).toContain('passed after retry');
    reporter.dispose();
  });

  it.each(['success', 'failed'] as const)(
    'keeps Case retry progress on its live branch across Steps, with only the final %s result retained',
    (status) => {
      vi.useFakeTimers();
      const { reporter, io } = fixture('default', true);
      const other = outcome('other Case');
      const retried = outcome('search', status);
      const failed = {
        ...retried.run!,
        attemptIndex: 0,
        status: 'failed' as const,
      };
      retried.run = { ...retried.run!, attemptIndex: 1 };
      retried.attempts = [failed, retried.run];
      reporter.event({
        type: 'step-start',
        projectName: 'web',
        info: step(other.name),
      });
      reporter.event({
        type: 'case-attempt-end',
        attempt: failed,
        maxAttempts: 2,
      });
      reporter.event({
        type: 'step-start',
        projectName: 'web',
        info: step('search', 1),
      });
      vi.advanceTimersByTime(100);
      expect(frame(io)).toMatch(/└─ search .* · attempt 2\/2/);
      expect(
        frame(io)
          .split('\n')
          .find((line) => line.includes(other.name)),
      ).not.toContain('attempt');
      reporter.event({
        type: 'step-end',
        projectName: 'web',
        info: step('search', 1),
      });
      reporter.event({
        type: 'step-start',
        projectName: 'web',
        info: { ...step('search', 1), node: 'aiAssert' },
      });
      vi.advanceTimersByTime(100);
      expect(frame(io)).toContain('attempt 2/2');
      expect(frame(io)).toContain('aiAssert');
      endFile(reporter, [other, retried], status);
      reporter.finish(runResult([projectResult('web', [other, retried])]));
      const output = stripVTControlCharacters(
        io.write.mock.calls.flat().join(''),
      );
      expect(output).not.toContain('case retry');
      expect(output).not.toContain('↻');
      expect(
        output.match(
          new RegExp(`${status === 'success' ? '✓' : '×'} search`, 'g'),
        ),
      ).toHaveLength(1);
      expect(output).toContain(
        `${status === 'success' ? 'passed after retry' : 'failed after retries'} (2 attempts)`,
      );
      reporter.dispose();
    },
  );

  it('coalesces rapid Step transitions while displaying parallel file trees and live counters', () => {
    vi.useFakeTimers();
    vi.stubEnv('NO_COLOR', undefined);
    const { reporter, io } = fixture('default', true, 3);
    const before = io.write.mock.calls.length;
    for (const id of ['third', 'first', 'second'])
      reporter.event({ type: 'step-start', projectName: id, info: step(id) });
    reporter.event({
      type: 'step-end',
      projectName: 'first',
      info: step('first'),
    });
    reporter.event({
      type: 'step-start',
      projectName: 'first',
      info: { ...step('first'), node: 'aiAssert' },
    });
    expect(io.write).toHaveBeenCalledTimes(before);
    vi.advanceTimersByTime(100);
    expect(io.write).toHaveBeenCalledTimes(before + 1);
    const output = frame(io);
    expect(output.indexOf('❯ first')).toBeLessThan(output.indexOf('❯ second'));
    expect(output.indexOf('❯ second')).toBeLessThan(output.indexOf('❯ third'));
    expect(output).toContain('└─ first');
    expect(output).toContain('step 2/3 · aiAssert');
    expect(output).toContain('Test Files 0 passed (2)');
    expect(output).toContain('Cases 0 passed (3)');
    expect(output).toContain('Start at');
    expect(output).toContain('Duration');
    expect(io.write.mock.calls.at(-1)![0]).toContain('\u001b[33m');
    expect(io.write.mock.calls.at(-1)![0]).toContain('\u001b[2m');
    reporter.dispose();
  });

  it('keeps warnings inside the live frame and still prints completed file trees', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true);
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('first'),
    });
    vi.advanceTimersByTime(100);
    const before = io.write.mock.calls.length;
    reporter.console({ type: 'warning', topic: 'web', message: 'a warning' });
    expect(io.write).toHaveBeenCalledTimes(before);
    vi.advanceTimersByTime(100);
    const output = io.write.mock.calls.slice(before).flat().join('');
    expect(output.indexOf('cases/shop.yaml')).toBeLessThan(
      output.indexOf('a warning'),
    );
    expect(output).toContain('Warnings');
    expect(output).not.toContain('WARN a warning');
    expect(output).toContain('\u001b[?2026h');
    expect(output).toContain('\u001b[?2026l');
    endFile(reporter, [outcome('first')]);
    vi.advanceTimersByTime(100);
    expect(io.write.mock.calls.flat().join('')).toContain('first');
    expect(frame(io)).not.toContain('└─ first');
    reporter.finish(runResult([projectResult('web', [outcome('first')])]));
    expect(
      stripVTControlCharacters(io.write.mock.calls.flat().join('')),
    ).toContain('└─ ✓ first');
    reporter.dispose();
    const writes = io.write.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(io.write).toHaveBeenCalledTimes(writes);
  });

  it('attaches concurrent request warnings only to their active Step and summarizes after completion', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true);
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('first'),
    });
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('second'),
    });
    vi.advanceTimersByTime(100);
    const before = io.write.mock.calls.length;
    reporter.console({
      type: 'warning',
      topic: 'ai',
      message: 'raw details',
      scope: {
        projectName: 'web',
        sourcePath: 'cases/shop.yaml',
        caseId: 'first',
        caseName: 'first',
        runId: 'first',
        phase: 'steps',
        stepIndex: 1,
      },
      warning: {
        kind: 'model-request-retry',
        callId: 'call',
        modelName: 'model',
        error: Object.assign(new Error('limited'), { status: 429 }),
        attempt: 1,
        maxAttempts: 2,
        delayMs: 2000,
      },
    });
    expect(io.write).toHaveBeenCalledTimes(before);
    vi.advanceTimersByTime(100);
    let current = frame(io);
    expect(current.indexOf('first')).toBeLessThan(
      current.indexOf('⚠ model request retry'),
    );
    expect(current.indexOf('⚠ model request retry')).toBeLessThan(
      current.indexOf('second'),
    );
    expect(current).not.toContain('raw details');
    reporter.event({
      type: 'step-end',
      projectName: 'web',
      info: step('first'),
    });
    vi.advanceTimersByTime(100);
    current = frame(io);
    expect(current).not.toContain('⚠ model request retry');
    expect(current).toContain('Warnings 1');
    const result = runResult([
      projectResult('web', [outcome('first'), outcome('second')]),
    ]);
    reporter.finish(result);
    const ended = io.write.mock.calls.length;
    reporter.summary(result);
    const summary = stripVTControlCharacters(
      io.write.mock.calls.slice(ended).flat().join(''),
    );
    expect(summary).toContain('Warnings 1');
    expect(summary.match(/WARN /g)).toHaveLength(1);
    expect(summary).toContain('first');
    expect(summary).toContain('step[2]');
  });

  it('adapts to terminal size with a bounded tree, and removes its resize listener', () => {
    vi.useFakeTimers();
    const { reporter, io, resize, removeResizeListener } = fixture(
      'default',
      true,
      5,
    );
    for (const id of ['first', 'second', 'third', 'fourth', 'fifth'])
      reporter.event({
        type: 'step-start',
        projectName: 'web',
        info: step(id),
      });
    io.columns = 40;
    io.rows = 12;
    resize();
    const lines = frame(io).split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines.join('\n')).toContain('more rows');
    expect(lines.every((line) => stringWidth(line) < io.columns)).toBe(true);
    expect(lines.join('\n')).toContain('Test Files');
    io.rows = 30;
    resize();
    expect(frame(io)).toContain('fifth');
    expect(frame(io)).not.toContain('more rows');
    reporter.dispose();
    expect(removeResizeListener).toHaveBeenCalledTimes(1);
    const writes = io.write.mock.calls.length;
    resize();
    expect(io.write).toHaveBeenCalledTimes(writes);
  });

  it('retains elapsed time when long Unicode Case names are truncated', () => {
    vi.useFakeTimers();
    const { reporter, io, resize } = fixture('default', true);
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('超长的中文用例名称👩‍💻'.repeat(10)),
    });
    io.columns = 40;
    vi.advanceTimersByTime(1000);
    resize();
    const lines = frame(io).split('\n');
    const active = lines.find((line) => line.includes('step 2/3'))!;
    expect(active).toContain('…');
    expect(active).toContain('step 2/3');
    expect(active).toMatch(/1\.0s$/);
    expect(lines.every((line) => stringWidth(line) < io.columns)).toBe(true);
    reporter.dispose();
  });

  it('shows document lifecycle hooks beside Case branches', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('default', true);
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('checkout'),
    });
    reporter.event({
      type: 'step-start',
      projectName: 'mobile',
      info: {
        scope: 'document',
        node: 'app.open',
        stepCount: 1,
        document: {
          documentId: 'mobile-doc',
          documentRunId: 'mobile-doc-run',
          projectId: 'mobile',
          projectName: 'mobile',
          sourcePath: 'cases/mobile.yaml',
          phase: 'beforeAll',
          stepIndex: 0,
        },
      },
    });
    vi.advanceTimersByTime(100);
    expect(frame(io)).toContain('❯ web · 1 file running');
    expect(frame(io)).toContain('└─ cases/shop.yaml');
    expect(frame(io)).toContain('└─ checkout');
    expect(frame(io)).toContain('❯ mobile · 1 file running');
    expect(frame(io)).toContain('└─ cases/mobile.yaml');
    expect(frame(io)).toContain('beforeAll 1/1 · app.open');
    reporter.dispose();
  });

  it('retains final file retry context while discarding intermediate failures', () => {
    const { reporter, io } = fixture();
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('checkout'),
    });
    endFile(reporter, [outcome('checkout')], 'success', 1);
    reporter.finish(runResult([projectResult('web', [outcome('checkout')])]));
    expect(text(io)).toContain('file retried 1x');
    expect(text(io)).not.toContain('×');
    reporter.dispose();
  });

  it('defers failure details until the end and prints the summary after errors without ANSI in CI', () => {
    const { reporter, io } = fixture();
    const original = new Error(
      'Assertion failed: badge is missing\nReason: page shows Off',
    );
    const error = new NodeExecutionError(
      'aiAssert',
      new NodeExecutionError('aiAssert', original),
    );
    expect(formatConciseError(error)).toBe(original.message);
    const result = runResult([
      projectResult('web', [outcome('checkout', 'failed')]),
    ]);
    reporter.failure('web/flow.yaml / checkout / steps[3] aiAssert', error);
    expect(io.error).not.toHaveBeenCalled();
    reporter.finish(result);
    reporter.summary(result);
    expect(text(io)).toContain('Failures 1');
    expect(io.error).toHaveBeenCalledTimes(1);
    expect(io.error.mock.calls[0][0]).toContain('Reason: page shows Off');
    expect(io.error.mock.calls[0][0]).not.toContain('NodeExecutionError');
    const footerCall = io.log.mock.calls.findIndex(([line]) =>
      line.includes('Start at'),
    );
    expect(io.error.mock.invocationCallOrder[0]).toBeLessThan(
      io.log.mock.invocationCallOrder[footerCall],
    );
    expect(io.log.mock.calls.flat().join('')).not.toContain('\u001b');
    expect(io.write).not.toHaveBeenCalled();
  });
  it('deduplicates SDK warnings per run while retaining distinct warnings and verbose report paths', () => {
    const entry = {
      type: 'warning' as const,
      topic: 'web',
      message: 'waitForNetworkIdle is skipped',
    };
    const first = fixture();
    first.reporter.console(entry);
    first.reporter.console(entry);
    first.reporter.console({ ...entry, message: 'navigation timed out' });
    first.reporter.console({
      ...entry,
      type: 'report',
      message: 'report file updated: agent.html',
    });
    expect(
      first.io.log.mock.calls.flat().filter((line) => line.startsWith('WARN')),
    ).toEqual([
      'WARN waitForNetworkIdle is skipped',
      'WARN navigation timed out',
    ]);
    const second = fixture('verbose');
    second.reporter.console(entry);
    second.reporter.console({
      ...entry,
      type: 'report',
      message: 'report file updated: agent.html',
    });
    expect(second.io.log).toHaveBeenCalledWith(
      'WARN waitForNetworkIdle is skipped',
    );
    expect(second.io.log).toHaveBeenCalledWith(
      'report file updated: agent.html',
    );
    first.reporter.dispose();
    second.reporter.dispose();
  });

  it('emits a low-frequency CI heartbeat for active steps and stops after disposal', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture();
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('slow AI'),
    });
    vi.advanceTimersByTime(29_999);
    const before = io.log.mock.calls.length;
    vi.advanceTimersByTime(1);
    expect(io.log).toHaveBeenLastCalledWith(
      expect.stringContaining(
        'Still running: [web] cases/shop.yaml › slow AI · step 2/3 · aiAct (30.0s)',
      ),
    );
    expect(io.write).not.toHaveBeenCalled();
    reporter.dispose();
    vi.advanceTimersByTime(60_000);
    expect(io.log).toHaveBeenCalledTimes(before + 1);
  });

  it('prints one contextual model request retry without raw provider diagnostics', () => {
    const provider = Object.assign(new Error('429 厂商资源池资源不足'), {
      status: 429,
      headers: { 'x-request-id': 'request-1' },
    });
    const error = new Error(
      'failed to call AI model service\nraw response body: details',
      { cause: provider },
    );
    const scope = {
      projectName: 'web',
      sourcePath: 'cases/shop.yaml',
      caseId: 'case-1',
      caseName: 'checkout',
      runId: 'attempt-1',
      phase: 'steps',
      stepIndex: 1,
      node: 'aiAct',
    };
    const detail: ConsoleLogEntry = {
      type: 'warning',
      topic: 'midscene:ai:call',
      scope,
      message: `call AI error ${provider.stack}\nheaders: request-1`,
      warning: {
        kind: 'model-request-detail',
        modelName: 'model',
        error: provider,
      },
    };
    const retry: ConsoleLogEntry = {
      type: 'warning',
      topic: detail.topic,
      scope,
      message: `AI call failed (attempt 1/2), retrying in 2000ms... ${error.stack}`,
      warning: {
        kind: 'model-request-retry',
        modelName: 'model',
        error,
        callId: 'call-1',
        attempt: 1,
        maxAttempts: 2,
        delayMs: 2000,
      },
    };
    const { reporter, io } = fixture();
    reporter.console(detail);
    reporter.console(retry);
    reporter.console(retry);
    expect(
      io.log.mock.calls.flat().filter((line) => line.startsWith('WARN')),
    ).toEqual([
      'WARN [web] › cases/shop.yaml › checkout › step[2] aiAct · model request retry 2/2 in 2s (model): 429 厂商资源池资源不足',
    ]);
    // Request counters from independently loaded SDKs must not hide another Case.
    reporter.console({
      ...retry,
      scope: { ...scope, caseId: 'case-2', caseName: 'search' },
    });
    expect(
      io.log.mock.calls.flat().filter((line) => line.startsWith('WARN')),
    ).toHaveLength(2);
    expect(io.log.mock.calls.flat().join('\n')).not.toMatch(
      /headers:|raw response|request-1| at /,
    );
    reporter.dispose();

    const verbose = fixture('verbose');
    verbose.reporter.console(detail);
    verbose.reporter.console(retry);
    expect(verbose.io.log.mock.calls.flat().join('\n')).toContain(
      detail.message,
    );
    expect(verbose.io.log.mock.calls.flat().join('\n')).toContain(
      retry.message,
    );
    verbose.reporter.dispose();
  });

  it('normalizes repeated warnings while retaining distinct errors and file lifecycle context', () => {
    const { reporter, io } = fixture();
    const scope = {
      projectName: 'mobile',
      sourcePath: 'cases/mobile.yaml',
      phase: 'beforeAll',
      stepIndex: 0,
      node: 'app.open',
    };
    for (const id of ['request-1', 'request-2']) {
      const error = Object.assign(new Error('Connection unavailable'), {
        headers: { requestId: id },
      });
      reporter.console({
        type: 'warning',
        topic: 'web',
        scope,
        message: `${error.stack}\nheaders: ${id}`,
        args: ['navigation failed', error],
      });
    }
    expect(
      io.log.mock.calls.flat().filter((line) => line.startsWith('WARN')),
    ).toEqual([
      'WARN [mobile] › cases/mobile.yaml › beforeAll[1] app.open · navigation failed: Connection unavailable',
    ]);
    reporter.console({
      type: 'warning',
      topic: 'web',
      scope,
      message: 'Other warning\nheaders: details',
    });
    expect(io.log.mock.calls.at(-1)![0]).toBe(
      'WARN [mobile] › cases/mobile.yaml › beforeAll[1] app.open · Other warning',
    );
    reporter.dispose();
  });

  it('keeps verbose output append-only even in an interactive terminal', () => {
    vi.useFakeTimers();
    const { reporter, io } = fixture('verbose', true);
    reporter.event({
      type: 'step-start',
      projectName: 'web',
      info: step('checkout'),
    });
    reporter.progress('step 2/3: aiAct');
    vi.advanceTimersByTime(60_000);
    expect(io.log).toHaveBeenCalledWith('step 2/3: aiAct');
    expect(io.write).not.toHaveBeenCalled();
    expect(io.onResize).not.toHaveBeenCalled();
    reporter.dispose();
  });

  it('validates reporter names and keeps nodes options separate', () => {
    expect(parseTestCliArgs(['--reporter=verbose']).reporter).toBe('verbose');
    expect(() => parseTestCliArgs(['--reporter', 'unknown'])).toThrow(
      'Unknown reporter',
    );
    expect(() => parseTestCliArgs(['nodes', '--reporter', 'default'])).toThrow(
      'not supported',
    );
  });
});
