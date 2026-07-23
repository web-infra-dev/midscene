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

afterEach(() => {
  (globalThis as Record<string, unknown>).__testProjectRunnerState = undefined;
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('test project main-process runner', () => {
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
        files: { include: ['missing/**/*.yaml'] },
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
    expect(existsSync(result.summaryPath)).toBe(true);
  });

  it('uses the test results directory by default', async () => {
    const root = createProject();
    writeWorkflow(root, 'empty.yaml', 'cases: []');

    const result = await runTestProject({ projectRoot: root });

    expect(result.resultDir).toContain(join(root, '.midscene', 'test-results'));
  });

  it('fails when config root does not point to a directory', async () => {
    const cwd = createProject();
    writeFileSync(
      join(cwd, 'midscene.config.ts'),
      `export default { root: './missing', nodes: [] };`,
    );

    await expect(runTestProject({ cwd })).rejects.toThrow(
      `Test project root does not exist or is not a directory: ${join(
        cwd,
        'missing',
      )}`,
    );
  });

  it('resolves config root and file selection before discovery', async () => {
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
          root: '../e2e',
          files: {
            include: ['selected/**/*.yaml'],
            exclude: ['**/*.draft.yaml'],
          },
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
      configPath: 'config/midscene.config.ts',
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
      schemaVersion: 1,
      projectRoot: configuredRoot,
      projects: [
        {
          name: 'default',
          sourceCount: 1,
          fileSelection: {
            include: ['selected/**/*.yaml'],
            exclude: ['**/*.draft.yaml'],
          },
        },
      ],
    });
  });

  it('lets an explicit CLI project directory override config root', async () => {
    const cwd = createProject();
    const configuredRoot = join(cwd, 'configured');
    const overrideRoot = join(cwd, 'override');
    const resultDir = join(cwd, 'results');
    mkdirSync(configuredRoot);
    mkdirSync(overrideRoot);
    writeFileSync(
      join(cwd, 'midscene.config.ts'),
      `
        export default {
          root: './configured',
          nodes: [{ name: 'noop', execute() {} }],
        };
      `,
    );
    writeWorkflow(
      configuredRoot,
      'configured.yaml',
      'cases: [{ name: configured, steps: [{ noop: run }] }]',
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
      '  [repeat 1/1] [document 1/1] progress.yaml',
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
      schemaVersion: 1,
      status: 'failed',
      summary: result.summary,
      projects: [
        {
          fileSelection: { include: ['**/*.{yaml,yml}'] },
          cases: [
            {
              status: 'failed',
              attempts: [{ resultFile: expect.stringContaining('/runs/') }],
            },
            {
              status: 'success',
              attempts: [{ resultFile: expect.stringContaining('/runs/') }],
            },
            {
              status: 'success',
              attempts: [{ resultFile: expect.stringContaining('/runs/') }],
            },
          ],
          collectionErrors: [],
        },
      ],
    });
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

  it('runs projects in config order with setup once, document lifecycle per repeat, and full-case retry', async () => {
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
              repeat: 2,
              retry: 1,
              variables: { value: 'android-value' },
            },
            {
              name: 'ios-regression',
              platform: 'ios',
              setup: createSetup('ios', 'ios'),
              tags: { include: ['ios'], exclude: [] },
              repeat: 1,
              retry: 0,
              variables: { value: 'ios-value' },
            },
          ],
          nodes: [{
            name: 'record',
            execute({ input, context, case: caseContext, document }) {
              const identity = caseContext || document;
              state.events.push(
                'node:' + context.projectName + ':' + input.value +
                ':repeat-' + identity.repeatIndex +
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
    expect(
      state.events.filter((event) => event.startsWith('project-setup')),
    ).toEqual(['project-setup:android-smoke', 'project-setup:ios-regression']);
    expect(
      state.events.filter((event) => event.startsWith('project-teardown')),
    ).toEqual([
      'project-teardown:android-smoke',
      'project-teardown:ios-regression',
    ]);
    expect(result.projects[0].cases).toHaveLength(2);
    expect(result.projects[0].documents).toHaveLength(2);
    expect(
      result.projects[0].cases.every((item) => item.attempts?.length === 2),
    ).toBe(true);
    expect(
      new Set(
        result.projects[0].cases.flatMap((item) =>
          (item.attempts ?? []).map((attempt) => attempt.runId),
        ),
      ).size,
    ).toBe(4);
    expect(result.projects[1].cases).toHaveLength(1);
    expect(result.projects[1].cases[0].attempts).toHaveLength(1);
    expect(result.summary).toMatchObject({
      total: 3,
      passed: 3,
      failed: 0,
      filtered: 2,
      projectFailures: 0,
    });

    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(
      summary.projects.map((project: { name: string }) => project.name),
    ).toEqual(['android-smoke', 'ios-regression']);
    expect(summary.projects[0].cases[0].attempts).toHaveLength(2);
    for (const attempt of summary.projects[0].cases[0].attempts) {
      expect(
        existsSync(join(result.summaryPath, '..', attempt.resultFile)),
      ).toBe(true);
    }
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

  it('rejects scheduling options that are not part of the serial runner', () => {
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
  });
});
