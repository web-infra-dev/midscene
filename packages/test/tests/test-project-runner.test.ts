import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTestRunId,
  discoverTestConfig,
  discoverTestFiles,
  runTestProject,
} from '../src/cli';
import { parseTestCliArgs } from '../src/cli/test-command';

interface RunnerState {
  configLoads: number;
  active: number;
  maxActive: number;
  events: string[];
  contexts: Record<string, unknown>;
  collectionCompletedBeforeSetup: boolean[];
  resultDir: string;
}

const directories: string[] = [];

const createProject = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-test-runner-'));
  directories.push(root);
  return root;
};

const writeWorkflow = (root: string, path: string, source: string) => {
  const absolutePath = join(root, path);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, source);
};

const setRunnerState = (resultDir: string): RunnerState => {
  const state: RunnerState = {
    configLoads: 0,
    active: 0,
    maxActive: 0,
    events: [],
    contexts: {},
    collectionCompletedBeforeSetup: [],
    resultDir,
  };
  (globalThis as Record<string, unknown>).__testProjectRunnerState = state;
  return state;
};

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => {
  (globalThis as Record<string, unknown>).__testProjectRunnerState = undefined;
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('test project main-process runner', () => {
  it('formats run ids with a local timestamp and UUID prefix', () => {
    expect(
      createTestRunId(
        new Date(2026, 7, 7, 9, 5, 4),
        '12345678-abcd-4abc-8abc-1234567890ab',
      ),
    ).toBe('20260807090504-12345678');
  });

  it('discovers only midscene.config.ts', () => {
    const root = createProject();
    const configPath = join(root, 'midscene.config.ts');
    writeFileSync(configPath, 'export default { nodes: [] };');

    expect(discoverTestConfig(root)).toBe(configPath);
  });

  it.each(['js', 'cjs', 'mts', 'cts', 'tsx'])(
    'rejects a midscene.config.%s discovery candidate',
    (extension) => {
      const root = createProject();
      writeFileSync(
        join(root, 'midscene.config.ts'),
        'export default { nodes: [] };',
      );
      writeFileSync(join(root, `midscene.config.${extension}`), 'unsupported');

      expect(() => discoverTestConfig(root)).toThrow(
        'Only midscene.config.ts is supported.',
      );
    },
  );

  it('does not discover the removed config name', () => {
    const root = createProject();
    writeFileSync(join(root, 'midscene.workflow.config.cjs'), 'unsupported');

    expect(discoverTestConfig(root)).toBeUndefined();
  });

  it('discovers YAML recursively in deterministic order', () => {
    const root = createProject();
    mkdirSync(join(root, '.hidden'));
    mkdirSync(join(root, 'nested'));
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'z.yml'), 'cases: []');
    writeFileSync(join(root, 'nested', 'a.yaml'), 'cases: []');
    writeFileSync(join(root, '.hidden', 'b.YAML'), 'cases: []');
    writeFileSync(join(root, 'node_modules', 'ignored.yaml'), 'cases: []');
    writeFileSync(join(root, 'notes.txt'), 'not yaml');

    expect(
      discoverTestFiles(root).map((file) => file.slice(root.length + 1)),
    ).toEqual(['.hidden/b.YAML', 'nested/a.yaml', 'z.yml']);
  });

  it('applies include and exclude patterns with stable deduplication', () => {
    const root = createProject();
    writeWorkflow(root, 'flows/a.yaml', 'cases: []');
    writeWorkflow(root, 'flows/nested/b.yml', 'cases: []');
    writeWorkflow(root, 'flows/nested/b.draft.yml', 'cases: []');
    writeWorkflow(root, 'other/c.yaml', 'cases: []');
    writeWorkflow(root, '.midscene/ignored.yaml', 'cases: []');

    expect(
      discoverTestFiles(root, {
        include: ['flows/**/*.yaml', 'flows/**/*.{yaml,yml}'],
        exclude: ['**/*.draft.yml'],
      }).map((file) => file.slice(root.length + 1)),
    ).toEqual(['flows/a.yaml', 'flows/nested/b.yml']);
  });

  it('reports an empty final file selection as a preflight failure', async () => {
    const cwd = createProject();
    writeFileSync(
      join(cwd, 'midscene.config.ts'),
      `export default {
        projects: [{
          name: 'default',
          platform: 'web',
          files: { include: ['missing/**/*.yaml'] },
        }],
        nodes: [],
      };`,
    );

    const result = await runTestProject({ cwd });

    expect(result).toMatchObject({
      status: 'failed',
      exitCode: 1,
      summary: { collectionErrors: 1, projectFailures: 1 },
      projects: [
        {
          name: 'default',
          status: 'failed',
          collectionErrors: [
            {
              sourcePath: '<project>',
              error: {
                message: expect.stringContaining(
                  'No workflow YAML files found for project "default"',
                ),
              },
            },
          ],
        },
      ],
    });
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(summary.projects[0]).toMatchObject({
      projectId: 'project-0',
      collectionErrors: [
        {
          errorFile: expect.stringMatching(/^project-0\/collection-errors\//),
        },
      ],
    });
    expect(
      existsSync(
        resolve(
          dirname(result.summaryPath),
          summary.projects[0].collectionErrors[0].errorFile,
        ),
      ),
    ).toBe(true);
    expect(existsSync(result.summaryPath)).toBe(true);
  });

  it('uses the test results directory by default', async () => {
    const root = createProject();
    writeWorkflow(root, 'empty.yaml', 'cases: []');

    const result = await runTestProject({ projectRoot: root });

    expect(result.resultDir).toContain(join(root, '.midscene', 'test-results'));
  });

  it('writes each run into an isolated JSON result tree', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `export default {
        nodes: [{ name: 'noop', execute() {} }],
      };`,
    );
    writeWorkflow(
      root,
      'flows/example.yaml',
      'cases: [{ name: example, steps: [{ noop: run }] }]',
    );

    const first = await runTestProject({ projectRoot: root, resultDir });
    const firstRunDir = join(resultDir, first.runId);

    expect(first.runId).toMatch(/^\d{14}-[0-9a-f]{8}$/);
    expect(first.resultDir).toBe(resultDir);
    expect(first.summaryPath).toBe(join(firstRunDir, 'summary.json'));

    const summary = JSON.parse(readFileSync(first.summaryPath, 'utf8'));
    const [document] = summary.projects[0].documents;
    const [caseResult] = summary.projects[0].cases;
    const [attempt] = caseResult.attempts;

    expect(summary).toMatchObject({
      schemaVersion: 3,
      runId: first.runId,
      factsRoot: '.',
      projects: [{ projectId: 'project-0' }],
    });
    expect(document).not.toHaveProperty('documentRunId');
    expect(document.resultFile).toBe(
      `project-0/documents/${document.documentId}/document.json`,
    );
    expect(caseResult.documentId).toBe(document.documentId);
    expect(attempt).not.toHaveProperty('runId');
    expect(attempt.resultFile).toBe(
      `project-0/documents/${document.documentId}/cases/${caseResult.caseId}/${attempt.attemptId}.json`,
    );

    const documentFact = JSON.parse(
      readFileSync(join(firstRunDir, document.resultFile), 'utf8'),
    );
    const attemptFact = JSON.parse(
      readFileSync(join(firstRunDir, attempt.resultFile), 'utf8'),
    );
    expect(documentFact).not.toHaveProperty('documentRunId');
    expect(attemptFact).toMatchObject({
      caseId: caseResult.caseId,
      attemptId: attempt.attemptId,
    });
    expect(attemptFact).not.toHaveProperty('runId');
    expect(existsSync(join(resultDir, 'runs'))).toBe(false);
    expect(existsSync(join(resultDir, 'documents'))).toBe(false);
    expect(existsSync(join(firstRunDir, 'documents'))).toBe(false);
    expect(existsSync(join(firstRunDir, 'project-0', 'documents'))).toBe(true);
    expect(existsSync(join(root, 'midscene_run'))).toBe(false);

    const second = await runTestProject({ projectRoot: root, resultDir });
    expect(second.runId).not.toBe(first.runId);
    expect(second.summaryPath).not.toBe(first.summaryPath);
    expect(existsSync(first.summaryPath)).toBe(true);
    expect(existsSync(second.summaryPath)).toBe(true);
    expect(JSON.parse(readFileSync(first.summaryPath, 'utf8')).runId).toBe(
      first.runId,
    );
  });

  it('rejects the removed config root field', async () => {
    const cwd = createProject();
    writeFileSync(
      join(cwd, 'midscene.config.ts'),
      `export default { root: './missing', nodes: [] };`,
    );

    await expect(runTestProject({ cwd })).rejects.toThrow(
      'Midscene config root is not supported',
    );
  });

  it('uses the CLI project directory and Project file selection for discovery', async () => {
    const cwd = createProject();
    const configuredRoot = join(cwd, 'e2e');
    const configDirectory = join(cwd, 'config');
    const resultDir = join(cwd, 'results');
    mkdirSync(configuredRoot);
    mkdirSync(configDirectory);
    writeFileSync(
      join(configDirectory, 'midscene.config.ts'),
      `
        export default {
          projects: [{
            name: 'web',
            platform: 'web',
            files: {
              include: ['selected/**/*.yaml'],
              exclude: ['**/*.draft.yaml'],
            },
          }],
          nodes: [{ name: 'noop', execute() {} }],
        };
      `,
    );
    writeWorkflow(
      configuredRoot,
      'selected/run.yaml',
      'cases: [{ name: selected, steps: [{ noop: run }] }]',
    );
    writeWorkflow(
      configuredRoot,
      'selected/ignored.draft.yaml',
      'cases: invalid',
    );
    writeWorkflow(cwd, 'outside.yaml', 'cases: invalid');

    const result = await runTestProject({
      cwd,
      projectRoot: './e2e',
      configPath: '../config/midscene.config.ts',
      resultDir,
    });

    expect(result.summary).toMatchObject({
      total: 1,
      passed: 1,
      collectionErrors: 0,
    });
    expect(result.cases[0].sourcePath).toBe('selected/run.yaml');
    const projectResult = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(projectResult).toMatchObject({
      schemaVersion: 3,
      projectRoot: configuredRoot,
      projects: [
        {
          projectId: 'project-0',
          name: 'web',
          sourceCount: 1,
          fileSelection: {
            include: ['selected/**/*.yaml'],
            exclude: ['**/*.draft.yaml'],
          },
        },
      ],
    });
  });

  it('uses an explicit CLI project directory for config and YAML discovery', async () => {
    const cwd = createProject();
    const overrideRoot = join(cwd, 'override');
    const resultDir = join(cwd, 'results');
    mkdirSync(overrideRoot);
    writeFileSync(
      join(cwd, 'midscene.config.ts'),
      `
        export default {
          nodes: [{ name: 'noop', execute() {} }],
        };
      `,
    );
    writeWorkflow(
      overrideRoot,
      'override.yaml',
      'cases: [{ name: override, steps: [{ noop: run }] }]',
    );

    const result = await runTestProject({
      cwd,
      projectRoot: './override',
      configPath: '../midscene.config.ts',
      resultDir,
    });

    expect(result.cases).toEqual([
      expect.objectContaining({ name: 'override', status: 'success' }),
    ]);
    const projectResult = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(projectResult.projectRoot).toBe(overrideRoot);
    expect(projectResult.projects[0].fileSelection).toEqual({
      include: ['**/*.{yaml,yml}'],
    });
  });

  it('reports live document, case, and step progress', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const progress: string[] = [];
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `export default {
        nodes: [{ name: 'noop', execute() {} }],
      };`,
    );
    writeWorkflow(
      root,
      'progress.yaml',
      `
beforeAll:
  - noop: prepare
beforeEach:
  - noop: reset
cases:
  - name: progress case
    steps:
      - noop: run
afterEach:
  - noop: capture
afterAll:
  - noop: cleanup
`,
    );

    await runTestProject({
      projectRoot: root,
      resultDir,
      onProgress: (message) => progress.push(message),
    });

    expect(progress).toEqual([
      'midscene-test: preflighted 1 projects, 1 documents, 1 cases, 0 collection errors',
      '[project 1/1] default (web)',
      '  [document 1/1] progress.yaml',
      '    → beforeAll 1/1: noop',
      expect.stringMatching(/^ {4}✓ beforeAll 1\/1: noop \(\d+ ms\)$/),
      '    [case 1/1] progress case',
      '      → beforeEach 1/1: noop',
      expect.stringMatching(/^ {6}✓ beforeEach 1\/1: noop \(\d+ ms\)$/),
      '      → step 1/1: noop',
      expect.stringMatching(/^ {6}✓ step 1\/1: noop \(\d+ ms\)$/),
      '      → afterEach 1/1: noop',
      expect.stringMatching(/^ {6}✓ afterEach 1\/1: noop \(\d+ ms\)$/),
      expect.stringMatching(/^ {4}✓ attempt 1\/1: progress case \(\d+ ms\)$/),
      '    → afterAll 1/1: noop',
      expect.stringMatching(/^ {4}✓ afterAll 1\/1: noop \(\d+ ms\)$/),
    ]);
  });

  it('collects first, loads config once, and shares one Project context serially', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        import { existsSync } from 'node:fs';
        import { join } from 'node:path';
        const state = globalThis.__testProjectRunnerState;
        state.configLoads += 1;
        const node = {
          name: 'test.record',
          async execute({ input, context }) {
            if (context !== state.contexts.project) {
              throw new Error('case did not receive its Project context');
            }
            state.active += 1;
            state.maxActive = Math.max(state.maxActive, state.active);
            state.events.push('step:' + input.value + ':' + process.pid);
            await Promise.resolve();
            state.active -= 1;
            if (input.fail) throw new Error('controlled failure');
          },
        };
        export default {
          nodes: [node],
          setup: {
            name: 'fixture',
            platform: 'web',
            setup({ project, onTeardown }) {
              state.collectionCompletedBeforeSetup.push(
                existsSync(join(state.resultDir, 'collection-errors')),
              );
              const context = { projectName: project.name };
              state.contexts.project = context;
              state.events.push('setup:' + project.name + ':' + process.pid);
              onTeardown(() => {
                state.events.push('teardown:' + project.name + ':' + process.pid);
              });
              return context;
            },
          },
        };
      `,
    );
    writeWorkflow(
      root,
      'a.yaml',
      `
cases:
  - name: first fails
    steps:
      - test.record:
          source: a.yaml
          value: first
          fail: true
  - name: second still runs
    steps:
      - test.record:
          source: a.yaml
          value: second
`,
    );
    writeWorkflow(
      root,
      'nested/b.yml',
      `
cases:
  - name: third document runs
    steps:
      - test.record:
          source: nested/b.yml
          value: third
`,
    );
    const beforeSigint = process.listenerCount('SIGINT');
    const beforeSigterm = process.listenerCount('SIGTERM');
    const result = await runTestProject({ projectRoot: root, resultDir });

    expect(state.configLoads).toBe(1);
    expect(state.maxActive).toBe(1);
    expect(state.collectionCompletedBeforeSetup).toEqual([false]);
    expect(state.events).toEqual([
      `setup:default:${process.pid}`,
      `step:first:${process.pid}`,
      `step:second:${process.pid}`,
      `step:third:${process.pid}`,
      `teardown:default:${process.pid}`,
    ]);
    expect(result).toMatchObject({
      status: 'failed',
      exitCode: 1,
      summary: {
        total: 3,
        passed: 2,
        failed: 1,
        notRun: 0,
        collectionErrors: 0,
        documentFailures: 0,
      },
    });
    expect(result.cases.map((caseResult) => caseResult.status)).toEqual([
      'failed',
      'success',
      'success',
    ]);
    expect(result).not.toHaveProperty('rstest');
    expect(existsSync(join(resultDir, 'manifest.json'))).toBe(false);
    expect(existsSync(join(resultDir, 'rstest-tests'))).toBe(false);
    expect(process.listenerCount('SIGINT')).toBe(beforeSigint);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSigterm);

    const projectResult = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(projectResult).toMatchObject({
      schemaVersion: 3,
      status: 'failed',
      summary: result.summary,
      projects: [
        {
          projectId: 'project-0',
          fileSelection: { include: ['**/*.{yaml,yml}'] },
          cases: [
            {
              status: 'failed',
              attempts: [{ resultFile: expect.stringContaining('/cases/') }],
            },
            {
              status: 'success',
              attempts: [{ resultFile: expect.stringContaining('/cases/') }],
            },
            {
              status: 'success',
              attempts: [{ resultFile: expect.stringContaining('/cases/') }],
            },
          ],
          collectionErrors: [],
        },
      ],
    });
  });

  it('limits concurrent Project runtimes, keeps each Project serial, and preserves result order', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const alphaGate = createDeferred();
    const betaGate = createDeferred();
    const gammaGate = createDeferred();
    const twoProjectsStarted = createDeferred();
    const gammaStarted = createDeferred();
    const gammaFinished = createDeferred();
    const progress: string[] = [];
    const state = setRunnerState(resultDir) as RunnerState & {
      gates: Record<string, Promise<void>>;
      projectActive: number;
      projectMaxActive: number;
      caseActive: Record<string, number>;
      caseMaxActive: Record<string, number>;
      onProjectStart(name: string): void;
      onProjectFinish(name: string): void;
      onCaseStart(name: string): void;
      onCaseFinish(name: string): void;
    };
    state.gates = {
      alpha: alphaGate.promise,
      beta: betaGate.promise,
      gamma: gammaGate.promise,
    };
    state.projectActive = 0;
    state.projectMaxActive = 0;
    state.caseActive = {};
    state.caseMaxActive = {};
    state.onProjectStart = (name) => {
      state.projectActive += 1;
      state.projectMaxActive = Math.max(
        state.projectMaxActive,
        state.projectActive,
      );
      state.events.push(`project-setup:${name}`);
      if (state.projectActive === 2) twoProjectsStarted.resolve();
      if (name === 'gamma') gammaStarted.resolve();
    };
    state.onProjectFinish = (name) => {
      state.events.push(`project-teardown:${name}`);
      state.projectActive -= 1;
      if (name === 'gamma') gammaFinished.resolve();
    };
    state.onCaseStart = (name) => {
      state.caseActive[name] = (state.caseActive[name] ?? 0) + 1;
      state.caseMaxActive[name] = Math.max(
        state.caseMaxActive[name] ?? 0,
        state.caseActive[name],
      );
    };
    state.onCaseFinish = (name) => {
      state.caseActive[name] -= 1;
    };
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'concurrent-project',
          platform: 'web',
          async setup({ project, onTeardown }) {
            state.onProjectStart(project.name);
            onTeardown(() => state.onProjectFinish(project.name));
            await state.gates[project.name];
            return { projectName: project.name };
          },
        };
        export default {
          projects: [
            { name: 'alpha', platform: 'web', setup },
            { name: 'beta', platform: 'web', setup },
            { name: 'gamma', platform: 'web', setup },
          ],
          test: { maxConcurrency: 2 },
          nodes: [{
            name: 'test.record',
            async execute({ context }) {
              state.onCaseStart(context.projectName);
              try {
                await Promise.resolve();
              } finally {
                state.onCaseFinish(context.projectName);
              }
            },
          }],
        };
      `,
    );
    writeWorkflow(
      root,
      'concurrent.yaml',
      `
cases:
  - name: first
    steps:
      - test.record: first
  - name: second
    steps:
      - test.record: second
`,
    );

    const runPromise = runTestProject({
      projectRoot: root,
      resultDir,
      onProgress: (message) => progress.push(message),
    });

    await twoProjectsStarted.promise;
    expect(state.events).toEqual(['project-setup:alpha', 'project-setup:beta']);
    expect(state.projectMaxActive).toBe(2);
    expect(state.events).not.toContain('project-setup:gamma');

    betaGate.resolve();
    await gammaStarted.promise;
    expect(state.events.indexOf('project-teardown:beta')).toBeLessThan(
      state.events.indexOf('project-setup:gamma'),
    );

    gammaGate.resolve();
    await gammaFinished.promise;
    alphaGate.resolve();
    const result = await runPromise;

    expect(state.projectActive).toBe(0);
    expect(state.projectMaxActive).toBe(2);
    expect(state.caseMaxActive).toEqual({ alpha: 1, beta: 1, gamma: 1 });
    expect(result.projects.map((project) => project.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(
      state.events.filter((event) => event.startsWith('project-teardown')),
    ).toEqual([
      'project-teardown:beta',
      'project-teardown:gamma',
      'project-teardown:alpha',
    ]);
    for (const name of ['alpha', 'beta', 'gamma']) {
      expect(
        progress.some((message) =>
          message.startsWith(`[${name}]  [document 1/1]`),
        ),
      ).toBe(true);
    }

    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(
      summary.projects.map((project: { name: string }) => project.name),
    ).toEqual(['alpha', 'beta', 'gamma']);
    expect(
      summary.projects.map(
        (project: { projectId: string }) => project.projectId,
      ),
    ).toEqual(['project-0', 'project-1', 'project-2']);
    expect(
      new Set(
        summary.projects.flatMap(
          (project: { documents: Array<{ documentId: string }> }) =>
            project.documents.map((document) => document.documentId),
        ),
      ).size,
    ).toBe(3);
    for (const project of summary.projects) {
      for (const document of project.documents) {
        expect(document.resultFile).toMatch(
          new RegExp(`^${project.projectId}/documents/`),
        );
        expect(
          existsSync(resolve(dirname(result.summaryPath), document.resultFile)),
        ).toBe(true);
      }
      for (const caseResult of project.cases) {
        for (const attempt of caseResult.attempts) {
          expect(attempt.resultFile).toMatch(
            new RegExp(`^${project.projectId}/documents/`),
          );
          expect(
            existsSync(
              resolve(dirname(result.summaryPath), attempt.resultFile),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it('stops claiming Projects on bail and drains the active Project cases', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const betaStarted = createDeferred();
    const releaseBeta = createDeferred();
    const alphaFinished = createDeferred();
    const state = setRunnerState(resultDir) as RunnerState & {
      betaStarted: ReturnType<typeof createDeferred>;
      releaseBeta: Promise<void>;
      onProjectFinish(name: string): void;
    };
    state.betaStarted = betaStarted;
    state.releaseBeta = releaseBeta.promise;
    state.onProjectFinish = (name) => {
      state.events.push(`project-teardown:${name}`);
      if (name === 'alpha') alphaFinished.resolve();
    };
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'bail-project',
          platform: 'web',
          setup({ project, onTeardown }) {
            state.events.push('project-setup:' + project.name);
            onTeardown(() => state.onProjectFinish(project.name));
            return { projectName: project.name };
          },
        };
        export default {
          projects: [
            { name: 'alpha', platform: 'web', setup },
            { name: 'beta', platform: 'web', setup },
            { name: 'gamma', platform: 'web', setup },
          ],
          test: { maxConcurrency: 2, bail: 1 },
          nodes: [{
            name: 'test.bail',
            async execute({ input, context }) {
              if (input.phase !== 'first') return;
              if (context.projectName === 'alpha') {
                await state.betaStarted.promise;
                throw new Error('controlled alpha failure');
              }
              if (context.projectName === 'beta') {
                state.betaStarted.resolve();
                await state.releaseBeta;
              }
            },
          }],
        };
      `,
    );
    writeWorkflow(
      root,
      'bail.yaml',
      `
cases:
  - name: first
    steps:
      - test.bail:
          phase: first
  - name: second
    steps:
      - test.bail:
          phase: second
`,
    );

    const runPromise = runTestProject({ projectRoot: root, resultDir });
    await alphaFinished.promise;
    expect(state.events).not.toContain('project-setup:gamma');
    releaseBeta.resolve();
    const result = await runPromise;

    const projectsByName = Object.fromEntries(
      result.projects.map((project) => [project.name, project]),
    );
    expect(
      projectsByName.alpha.cases.map((caseResult) => ({
        status: caseResult.status,
        reason: caseResult.notRunReason,
      })),
    ).toEqual([
      { status: 'failed', reason: undefined },
      { status: 'not-run', reason: 'bail' },
    ]);
    expect(
      projectsByName.beta.cases.map((caseResult) => ({
        status: caseResult.status,
        reason: caseResult.notRunReason,
      })),
    ).toEqual([
      { status: 'success', reason: undefined },
      { status: 'not-run', reason: 'bail' },
    ]);
    expect(
      projectsByName.gamma.cases.map((caseResult) => ({
        status: caseResult.status,
        reason: caseResult.notRunReason,
      })),
    ).toEqual([
      { status: 'not-run', reason: 'bail' },
      { status: 'not-run', reason: 'bail' },
    ]);
    expect(
      state.events.filter((event) => event.startsWith('project-setup:')),
    ).toEqual(['project-setup:alpha', 'project-setup:beta']);
    expect(
      state.events.filter((event) => event.startsWith('project-teardown:')),
    ).toEqual(['project-teardown:alpha', 'project-teardown:beta']);
  });

  it('interrupts and drains every active Project without starting queued Projects', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const bothCasesStarted = createDeferred();
    const state = setRunnerState(resultDir) as RunnerState & {
      activeCaseCount: number;
      bothCasesStarted: ReturnType<typeof createDeferred>;
    };
    state.activeCaseCount = 0;
    state.bothCasesStarted = bothCasesStarted;
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'interrupt-project',
          platform: 'web',
          setup({ project, onTeardown }) {
            state.events.push('project-setup:' + project.name);
            onTeardown(() => state.events.push('project-teardown:' + project.name));
            return { projectName: project.name };
          },
        };
        export default {
          projects: [
            { name: 'alpha', platform: 'web', setup },
            { name: 'beta', platform: 'web', setup },
            { name: 'gamma', platform: 'web', setup },
          ],
          test: { maxConcurrency: 2 },
          nodes: [{
            name: 'test.interrupt',
            async execute({ input, context, signal }) {
              if (input.phase !== 'first') return;
              state.activeCaseCount += 1;
              state.events.push('case-start:' + context.projectName);
              if (state.activeCaseCount === 2) {
                state.bothCasesStarted.resolve();
              }
              if (context.projectName === 'alpha') {
                await state.bothCasesStarted.promise;
                process.emit('SIGTERM');
              } else {
                await new Promise((resolve) => {
                  if (signal.aborted) resolve();
                  else signal.addEventListener('abort', resolve, { once: true });
                });
              }
              state.events.push('case-finish:' + context.projectName);
            },
          }],
        };
      `,
    );
    writeWorkflow(
      root,
      'interrupt.yaml',
      `
cases:
  - name: first
    steps:
      - test.interrupt:
          phase: first
  - name: second
    steps:
      - test.interrupt:
          phase: second
`,
    );
    const beforeSigint = process.listenerCount('SIGINT');
    const beforeSigterm = process.listenerCount('SIGTERM');

    const result = await runTestProject({ projectRoot: root, resultDir });

    expect(result).toMatchObject({ status: 'failed', exitCode: 1 });
    expect(
      state.events.filter((event) => event.startsWith('project-setup:')),
    ).toEqual(['project-setup:alpha', 'project-setup:beta']);
    expect(state.events).not.toContain('project-setup:gamma');
    expect(
      state.events.filter((event) => event.startsWith('project-teardown:')),
    ).toEqual(
      expect.arrayContaining([
        'project-teardown:alpha',
        'project-teardown:beta',
      ]),
    );
    for (const project of result.projects.slice(0, 2)) {
      expect(project.cases[0]).toMatchObject({ status: 'success' });
      expect(project.cases[1]).toMatchObject({
        status: 'not-run',
        notRunReason: 'interrupted',
      });
    }
    expect(result.projects[2].cases).toEqual([
      expect.objectContaining({
        status: 'not-run',
        notRunReason: 'interrupted',
      }),
      expect.objectContaining({
        status: 'not-run',
        notRunReason: 'interrupted',
      }),
    ]);
    expect(process.listenerCount('SIGINT')).toBe(beforeSigint);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSigterm);
  });

  it('isolates a Project setup failure and tears it down without stopping peers', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'setup-failure-project',
          platform: 'web',
          setup({ project, onTeardown }) {
            state.events.push('project-setup:' + project.name);
            onTeardown(() => state.events.push('project-teardown:' + project.name));
            if (project.name === 'alpha') {
              throw new Error('controlled setup failure');
            }
            return { projectName: project.name };
          },
        };
        export default {
          projects: [
            { name: 'alpha', platform: 'web', setup },
            { name: 'beta', platform: 'web', setup },
          ],
          test: { maxConcurrency: 2 },
          nodes: [{
            name: 'test.record',
            execute({ context }) {
              state.events.push('case:' + context.projectName);
            },
          }],
        };
      `,
    );
    writeWorkflow(
      root,
      'setup-failure.yaml',
      `
cases:
  - name: first
    steps:
      - test.record: first
  - name: second
    steps:
      - test.record: second
`,
    );

    const result = await runTestProject({ projectRoot: root, resultDir });

    expect(result.projects[0]).toMatchObject({
      name: 'alpha',
      status: 'failed',
      lifecycle: { status: 'failed', setupError: expect.anything() },
      cases: [
        { status: 'not-run', notRunReason: 'project-setup-failed' },
        { status: 'not-run', notRunReason: 'project-setup-failed' },
      ],
    });
    expect(result.projects[1]).toMatchObject({
      name: 'beta',
      status: 'success',
      cases: [{ status: 'success' }, { status: 'success' }],
    });
    expect(state.events.filter((event) => event.startsWith('case:'))).toEqual([
      'case:beta',
      'case:beta',
    ]);
    expect(
      state.events.filter((event) => event.startsWith('project-teardown:')),
    ).toEqual(
      expect.arrayContaining([
        'project-teardown:alpha',
        'project-teardown:beta',
      ]),
    );
    expect(
      state.events.filter((event) => event === 'project-teardown:alpha'),
    ).toHaveLength(1);
    expect(
      state.events.filter((event) => event === 'project-teardown:beta'),
    ).toHaveLength(1);
  });

  it('contains fatal device errors within their owning Project', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'fatal-device-project',
          platform: 'web',
          setup({ project, onTeardown }) {
            state.events.push('project-setup:' + project.name);
            onTeardown(() => state.events.push('project-teardown:' + project.name));
            return { projectName: project.name };
          },
        };
        export default {
          projects: [
            { name: 'alpha', platform: 'web', setup },
            { name: 'beta', platform: 'web', setup },
            { name: 'gamma', platform: 'web', setup },
          ],
          test: { maxConcurrency: 2 },
          nodes: [{
            name: 'test.device',
            execute({ input, context }) {
              state.events.push('case:' + context.projectName + ':' + input.phase);
              if (context.projectName === 'alpha' && input.phase === 'first') {
                throw new Error('device offline');
              }
            },
          }],
        };
      `,
    );
    writeWorkflow(
      root,
      'fatal-device.yaml',
      `
cases:
  - name: first
    steps:
      - test.device:
          phase: first
  - name: second
    steps:
      - test.device:
          phase: second
`,
    );

    const result = await runTestProject({ projectRoot: root, resultDir });

    expect(result.projects[0].cases).toEqual([
      expect.objectContaining({ status: 'failed' }),
      expect.objectContaining({
        status: 'not-run',
        notRunReason: 'fatal-error',
      }),
    ]);
    for (const project of result.projects.slice(1)) {
      expect(project.cases).toEqual([
        expect.objectContaining({ status: 'success' }),
        expect.objectContaining({ status: 'success' }),
      ]);
    }
    expect(
      state.events.filter((event) => event.startsWith('project-setup:')),
    ).toEqual(
      expect.arrayContaining([
        'project-setup:alpha',
        'project-setup:beta',
        'project-setup:gamma',
      ]),
    );
    expect(state.events).not.toContain('case:alpha:second');
    expect(state.events).toContain('case:beta:second');
    expect(state.events).toContain('case:gamma:second');
  });

  it('stops only the owning Project after a document lifecycle fatal error', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'document-fatal-project',
          platform: 'web',
          setup({ project }) {
            return { projectName: project.name };
          },
        };
        export default {
          projects: [
            { name: 'alpha', platform: 'web', setup },
            { name: 'beta', platform: 'web', setup },
          ],
          test: { maxConcurrency: 2 },
          nodes: [
            {
              name: 'test.lifecycle',
              execute({ input, context }) {
                state.events.push('beforeAll:' + context.projectName);
                if (input.failForAlpha && context.projectName === 'alpha') {
                  throw new Error('device connection closed');
                }
              },
            },
            {
              name: 'test.body',
              execute({ input, context }) {
                state.events.push('body:' + context.projectName + ':' + input.document);
              },
            },
          ],
        };
      `,
    );
    writeWorkflow(
      root,
      'a-lifecycle.yaml',
      `
beforeAll:
  - test.lifecycle:
      failForAlpha: true
cases:
  - name: lifecycle document
    steps:
      - test.body:
          document: first
`,
    );
    writeWorkflow(
      root,
      'b-after.yaml',
      `
cases:
  - name: later document
    steps:
      - test.body:
          document: second
`,
    );

    const result = await runTestProject({ projectRoot: root, resultDir });

    expect(result.projects[0].cases).toEqual([
      expect.objectContaining({
        status: 'not-run',
        notRunReason: 'document-start-failed',
      }),
      expect.objectContaining({
        status: 'not-run',
        notRunReason: 'fatal-error',
      }),
    ]);
    expect(result.projects[1].cases).toEqual([
      expect.objectContaining({ status: 'success' }),
      expect.objectContaining({ status: 'success' }),
    ]);
    expect(state.events).not.toContain('body:alpha:first');
    expect(state.events).not.toContain('body:alpha:second');
    expect(state.events).toContain('body:beta:first');
    expect(state.events).toContain('body:beta:second');
  });

  it('aborts and drains active Projects before rethrowing an infrastructure error', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'drain-project',
          platform: 'web',
          async setup({ project, signal, onTeardown }) {
            state.events.push('project-setup:' + project.name);
            onTeardown(() => state.events.push('project-teardown:' + project.name));
            if (project.name === 'alpha') {
              await new Promise((resolve) => {
                if (signal.aborted) resolve();
                else signal.addEventListener('abort', resolve, { once: true });
              });
            }
            return { projectName: project.name };
          },
        };
        export default {
          projects: [
            { name: 'alpha', platform: 'web', setup },
            { name: 'beta', platform: 'web', setup },
            { name: 'gamma', platform: 'web', setup },
          ],
          test: { maxConcurrency: 2 },
          nodes: [{ name: 'noop', execute() {} }],
        };
      `,
    );
    writeWorkflow(
      root,
      'drain.yaml',
      'cases: [{ name: drain, steps: [{ noop: run }] }]',
    );
    const beforeSigint = process.listenerCount('SIGINT');
    const beforeSigterm = process.listenerCount('SIGTERM');

    let caught: unknown;
    try {
      await runTestProject({
        projectRoot: root,
        resultDir,
        onProgress: (message) => {
          if (message.startsWith('[beta]  [document 1/1]')) {
            throw new Error('controlled scheduler error');
          }
        },
      });
    } catch (error) {
      caught = error;
      state.events.push('run-rejected');
    }

    expect(caught).toMatchObject({ message: 'controlled scheduler error' });
    expect(
      state.events.filter((event) => event.startsWith('project-setup:')),
    ).toEqual(['project-setup:alpha', 'project-setup:beta']);
    expect(
      state.events.filter((event) => event.startsWith('project-teardown:')),
    ).toEqual(
      expect.arrayContaining([
        'project-teardown:alpha',
        'project-teardown:beta',
      ]),
    );
    expect(state.events).not.toContain('project-setup:gamma');
    expect(state.events.indexOf('project-teardown:alpha')).toBeLessThan(
      state.events.indexOf('run-rejected'),
    );
    expect(state.events.indexOf('project-teardown:beta')).toBeLessThan(
      state.events.indexOf('run-rejected'),
    );
    expect(process.listenerCount('SIGINT')).toBe(beforeSigint);
    expect(process.listenerCount('SIGTERM')).toBe(beforeSigterm);
  });

  it('finishes every selected project preflight before setup and skips a failed project setup', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const setup = {
          name: 'web-setup',
          platform: 'web',
          setup() {
            state.events.push('project-setup');
            return {};
          },
        };
        export default {
          projects: [{ name: 'web', platform: 'web', setup }],
          nodes: [{ name: 'noop', execute() {} }],
        };
      `,
    );
    writeWorkflow(
      root,
      'valid.yaml',
      'cases: [{ name: valid, steps: [{ noop: run }] }]',
    );
    writeWorkflow(root, 'invalid.yaml', 'cases: invalid');

    const result = await runTestProject({ projectRoot: root, resultDir });

    expect(state.events).toEqual([]);
    expect(result).toMatchObject({
      status: 'failed',
      summary: { collectionErrors: 1, notRun: 1 },
      projects: [
        {
          cases: [
            { status: 'not-run', notRunReason: 'project-preflight-failed' },
          ],
        },
      ],
    });
  });

  it('runs projects in config order with setup once and full-case retry', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        const createSetup = (name, platform) => ({
          name: 'setup-' + name,
          platform,
          setup({ project, onTeardown }) {
            state.events.push('project-setup:' + project.name);
            onTeardown(() => state.events.push('project-teardown:' + project.name));
            return { projectName: project.name, platform };
          },
        });
        export default {
          projects: [
            {
              name: 'android-smoke',
              platform: 'android',
              setup: createSetup('android', 'android'),
              tags: { include: ['android'], exclude: [] },
              retry: 1,
              variables: { value: 'android-value' },
            },
            {
              name: 'ios-regression',
              platform: 'ios',
              setup: createSetup('ios', 'ios'),
              tags: { include: ['ios'], exclude: [] },
              retry: 0,
              variables: { value: 'ios-value' },
            },
          ],
          nodes: [{
            name: 'record',
            execute({ input, context, case: caseContext }) {
              state.events.push(
                'node:' + context.projectName + ':' + input.value +
                (caseContext ? ':attempt-' + caseContext.attemptIndex : ''),
              );
              if (input.failFirst && caseContext.attemptIndex === 0) {
                throw new Error('first attempt fails');
              }
              return { summary: input.value };
            },
          }],
        };
      `,
    );
    writeWorkflow(
      root,
      'projects.yaml',
      `
beforeAll:
  - record:
      value: before-\${value}
cases:
  - name: android case
    tags: [android]
    steps:
      - record:
          value: \${value}
          failFirst: true
  - name: ios case
    tags: [ios]
    steps:
      - record:
          value: \${value}
`,
    );

    const result = await runTestProject({
      projectRoot: root,
      resultDir,
      projectNames: ['ios-regression', 'android-smoke'],
    });

    expect(result.status).toBe('success');
    expect(result.projects.map((project) => project.name)).toEqual([
      'android-smoke',
      'ios-regression',
    ]);
    expect(result.projects.map((project) => project.projectId)).toEqual([
      'project-0',
      'project-1',
    ]);
    expect(
      state.events.filter((event) => event.startsWith('project-setup')),
    ).toEqual(['project-setup:android-smoke', 'project-setup:ios-regression']);
    expect(
      state.events.filter((event) => event.startsWith('project-teardown')),
    ).toEqual([
      'project-teardown:android-smoke',
      'project-teardown:ios-regression',
    ]);
    expect(result.projects[0].cases).toHaveLength(1);
    expect(result.projects[0].documents).toHaveLength(1);
    expect(
      result.projects[0].cases.every((item) => item.attempts?.length === 2),
    ).toBe(true);
    expect(
      new Set(
        result.projects[0].cases.flatMap((item) =>
          (item.attempts ?? []).map((attempt) => attempt.runId),
        ),
      ).size,
    ).toBe(2);
    expect(result.projects[1].cases).toHaveLength(1);
    expect(result.projects[1].cases[0].attempts).toHaveLength(1);
    expect(result.summary).toMatchObject({
      total: 2,
      passed: 2,
      failed: 0,
      filtered: 2,
      projectFailures: 0,
    });

    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(
      summary.projects.map((project: { name: string }) => project.name),
    ).toEqual(['android-smoke', 'ios-regression']);
    expect(
      summary.projects.map(
        (project: { projectId: string }) => project.projectId,
      ),
    ).toEqual(['project-0', 'project-1']);
    expect(summary.projects[0].cases[0].attempts).toHaveLength(2);
    for (const attempt of summary.projects[0].cases[0].attempts) {
      expect(
        existsSync(join(result.summaryPath, '..', attempt.resultFile)),
      ).toBe(true);
    }

    const selectedResult = await runTestProject({
      projectRoot: root,
      resultDir: join(root, 'selected-results'),
      projectNames: ['ios-regression'],
    });
    expect(selectedResult.projects.map((project) => project.projectId)).toEqual(
      ['project-1'],
    );
    const selectedSummary = JSON.parse(
      readFileSync(selectedResult.summaryPath, 'utf8'),
    );
    expect(selectedSummary.projects[0].cases[0].attempts[0].resultFile).toMatch(
      /^project-1\/documents\//,
    );
  });

  it('indexes finalized attempt reports from node teardown in summary.json', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { dirname, join } from 'node:path';
        const state = globalThis.__testProjectRunnerState;
        export default {
          nodes: [{
            name: 'report',
            execute({ case: caseContext, onTeardown }) {
              const reportPath = join(
                state.resultDir,
                'reports',
                caseContext.runId + '.html',
              );
              onTeardown(() => {
                mkdirSync(dirname(reportPath), { recursive: true });
                writeFileSync(reportPath, '<html>report</html>');
                return { reportPaths: [reportPath] };
              });
            },
          }],
        };
      `,
    );
    writeWorkflow(
      root,
      'report.yaml',
      'cases: [{ name: report, steps: [{ report: create }] }]',
    );

    const result = await runTestProject({ projectRoot: root, resultDir });
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    const [attempt] = summary.projects[0].cases[0].attempts;

    expect(attempt.reports).toEqual([expect.stringMatching(/\.html$/)]);
    expect(isAbsolute(attempt.reports[0])).toBe(false);
    expect(
      existsSync(resolve(dirname(result.summaryPath), attempt.reports[0])),
    ).toBe(true);
  });

  it('marks every case not run when beforeAll fails and still cleans up', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.config.ts'),
      `
        const state = globalThis.__testProjectRunnerState;
        export default {
          nodes: [
            { name: 'body', execute() { state.events.push('body'); } },
            {
              name: 'before.fail',
              execute({ onTeardown }) {
                state.events.push('beforeAll');
                onTeardown(() => state.events.push('node-teardown'));
                throw new Error('beforeAll failed');
              },
            },
            {
              name: 'after',
              execute() { state.events.push('afterAll'); },
            },
          ],
        };
      `,
    );
    writeWorkflow(
      root,
      'failure.yaml',
      `
beforeAll:
  - before.fail: prepare
cases:
  - name: one
    steps:
      - body: first
  - name: two
    steps:
      - body: second
afterAll:
  - after: finish
`,
    );

    const result = await runTestProject({ projectRoot: root, resultDir });

    expect(state.events).toEqual(['beforeAll', 'afterAll', 'node-teardown']);
    expect(result.summary).toMatchObject({
      total: 2,
      passed: 0,
      failed: 0,
      notRun: 2,
      documentFailures: 1,
    });
    expect(result.cases).toEqual([
      expect.objectContaining({
        name: 'one',
        status: 'not-run',
        notRunReason: 'document-start-failed',
      }),
      expect.objectContaining({
        name: 'two',
        status: 'not-run',
        notRunReason: 'document-start-failed',
      }),
    ]);
    expect(result.documents[0]).toMatchObject({
      status: 'failed',
      beforeAll: [{ status: 'failed' }],
      afterAll: [{ status: 'success' }],
    });
  });

  it('rejects scheduling options that are not supported as CLI overrides', () => {
    for (const option of [
      '--parallel',
      '--max-concurrency',
      '--retry',
      '--bail',
    ]) {
      expect(() => parseTestCliArgs([option], '/workspace')).toThrow(
        `Unknown option: ${option}`,
      );
    }
    expect(parseTestCliArgs(['project'], '/workspace')).toEqual({
      cwd: '/workspace',
      projectRoot: '/workspace/project',
      configPath: undefined,
      resultDir: undefined,
    });
    expect(parseTestCliArgs([], '/workspace')).toEqual({
      cwd: '/workspace',
      projectRoot: undefined,
      configPath: undefined,
      resultDir: undefined,
    });
    expect(
      parseTestCliArgs(
        ['describe-nodes', 'project', '--config', 'midscene.config.ts'],
        '/workspace',
      ),
    ).toEqual({
      command: 'describe-nodes',
      cwd: '/workspace',
      projectRoot: '/workspace/project',
      configPath: 'midscene.config.ts',
      resultDir: undefined,
    });
    expect(() =>
      parseTestCliArgs(['describe-nodes', '--result-dir', 'results']),
    ).toThrow('--result-dir is not supported by describe-nodes');
    expect(
      parseTestCliArgs(
        ['project', '--project', 'ios', '--project', 'android'],
        '/workspace',
      ),
    ).toEqual({
      cwd: '/workspace',
      projectRoot: '/workspace/project',
      configPath: undefined,
      resultDir: undefined,
      projectNames: ['ios', 'android'],
    });
    expect(() =>
      parseTestCliArgs(['describe-nodes', '--project', 'ios']),
    ).toThrow('--project is not supported by describe-nodes');
    expect(
      parseTestCliArgs(
        ['migrate', 'legacy', '--output-dir', 'migrated'],
        '/workspace',
      ),
    ).toEqual({
      command: 'migrate',
      cwd: '/workspace',
      migrationSource: '/workspace/legacy',
      migrationOutputDir: '/workspace/migrated',
    });
    expect(() => parseTestCliArgs(['migrate', 'legacy'])).toThrow(
      'migrate requires --output-dir <directory>',
    );
    expect(() => parseTestCliArgs(['--output-dir', 'migrated'])).toThrow(
      '--output-dir is only supported by migrate',
    );
  });
});
