import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverWorkflowFiles, runWorkflowProject } from '../src/cli';
import { parseWorkflowCliArgs } from '../src/cli/workflow-command';

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
  const root = mkdtempSync(join(tmpdir(), 'midscene-workflow-runner-'));
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
  (globalThis as Record<string, unknown>).__workflowRunnerState = state;
  return state;
};

afterEach(() => {
  (globalThis as Record<string, unknown>).__workflowRunnerState = undefined;
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('workflow main-process runner', () => {
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
      discoverWorkflowFiles(root).map((file) => file.slice(root.length + 1)),
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
      discoverWorkflowFiles(root, {
        include: ['flows/**/*.yaml', 'flows/**/*.{yaml,yml}'],
        exclude: ['**/*.draft.yml'],
      }).map((file) => file.slice(root.length + 1)),
    ).toEqual(['flows/a.yaml', 'flows/nested/b.yml']);
  });

  it('fails when the final file selection matches no workflow YAML', async () => {
    const cwd = createProject();
    writeFileSync(
      join(cwd, 'midscene.workflow.config.cjs'),
      `module.exports = {
        files: { include: ['missing/**/*.yaml'] },
        nodes: [],
      };`,
    );

    await expect(runWorkflowProject({ cwd })).rejects.toThrow(
      `No workflow YAML files found in ${cwd}.`,
    );
  });

  it('fails when config root does not point to a directory', async () => {
    const cwd = createProject();
    writeFileSync(
      join(cwd, 'midscene.workflow.config.cjs'),
      `module.exports = { root: './missing', nodes: [] };`,
    );

    await expect(runWorkflowProject({ cwd })).rejects.toThrow(
      `Workflow project root does not exist or is not a directory: ${join(
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
      join(configDirectory, 'midscene.workflow.config.cjs'),
      `
        module.exports = {
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

    const result = await runWorkflowProject({
      cwd,
      configPath: 'config/midscene.workflow.config.cjs',
      resultDir,
    });

    expect(result.summary).toMatchObject({
      total: 1,
      passed: 1,
      collectionErrors: 0,
    });
    expect(result.cases[0].sourcePath).toBe('selected/run.yaml');
    const projectResult = JSON.parse(
      readFileSync(join(resultDir, 'project.json'), 'utf8'),
    );
    expect(projectResult).toMatchObject({
      version: 3,
      projectRoot: configuredRoot,
      fileSelection: {
        include: ['selected/**/*.yaml'],
        exclude: ['**/*.draft.yaml'],
      },
      sources: [{ sourcePath: 'selected/run.yaml' }],
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
      join(cwd, 'midscene.workflow.config.cjs'),
      `
        module.exports = {
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

    const result = await runWorkflowProject({
      cwd,
      projectRoot: './override',
      configPath: '../midscene.workflow.config.cjs',
      resultDir,
    });

    expect(result.cases).toEqual([
      expect.objectContaining({ name: 'override', status: 'success' }),
    ]);
    const projectResult = JSON.parse(
      readFileSync(join(resultDir, 'project.json'), 'utf8'),
    );
    expect(projectResult.projectRoot).toBe(overrideRoot);
    expect(projectResult.fileSelection).toEqual({
      include: ['**/*.{yaml,yml}'],
    });
  });

  it('reports live document, case, and step progress', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const progress: string[] = [];
    writeFileSync(
      join(root, 'midscene.workflow.config.cjs'),
      `module.exports = {
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

    await runWorkflowProject({
      projectRoot: root,
      resultDir,
      onProgress: (message) => progress.push(message),
    });

    expect(progress).toEqual([
      'midscene-workflow: collected 1 documents, 1 cases, 0 collection errors',
      '[document 1/1] progress.yaml',
      '  → beforeAll 1/1: noop',
      expect.stringMatching(/^ {2}✓ beforeAll 1\/1: noop \(\d+ ms\)$/),
      '  [case 1/1] progress case',
      '    → beforeEach 1/1: noop',
      expect.stringMatching(/^ {4}✓ beforeEach 1\/1: noop \(\d+ ms\)$/),
      '    → step 1/1: noop',
      expect.stringMatching(/^ {4}✓ step 1\/1: noop \(\d+ ms\)$/),
      '    → afterEach 1/1: noop',
      expect.stringMatching(/^ {4}✓ afterEach 1\/1: noop \(\d+ ms\)$/),
      expect.stringMatching(/^ {2}✓ case 1\/1: progress case \(\d+ ms\)$/),
      '  → afterAll 1/1: noop',
      expect.stringMatching(/^ {2}✓ afterAll 1\/1: noop \(\d+ ms\)$/),
      expect.stringMatching(/^✓ document 1\/1: progress\.yaml \(\d+ ms\)$/),
    ]);
  });

  it('collects first, loads config once, and runs cases serially in one process', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.workflow.config.cjs'),
      `
        const { existsSync } = require('node:fs');
        const { join } = require('node:path');
        const state = globalThis.__workflowRunnerState;
        state.configLoads += 1;
        const node = {
          name: 'test.record',
          async execute({ input, context }) {
            if (context !== state.contexts[input.source]) {
              throw new Error('case did not receive its document context');
            }
            state.active += 1;
            state.maxActive = Math.max(state.maxActive, state.active);
            state.events.push('step:' + input.value + ':' + process.pid);
            await Promise.resolve();
            state.active -= 1;
            if (input.fail) throw new Error('controlled failure');
          },
        };
        module.exports = {
          nodes: [node],
          setupDocument({ sourcePath, onTeardown }) {
            state.collectionCompletedBeforeSetup.push(
              existsSync(join(state.resultDir, 'collection-errors')),
            );
            const context = { sourcePath };
            state.contexts[sourcePath] = context;
            state.events.push('setup:' + sourcePath + ':' + process.pid);
            onTeardown(() => {
              state.events.push('teardown:' + sourcePath + ':' + process.pid);
            });
            return context;
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
    writeWorkflow(root, 'z-invalid.yaml', 'cases: invalid');

    const beforeSigint = process.listenerCount('SIGINT');
    const beforeSigterm = process.listenerCount('SIGTERM');
    const result = await runWorkflowProject({ projectRoot: root, resultDir });

    expect(state.configLoads).toBe(1);
    expect(state.maxActive).toBe(1);
    expect(state.collectionCompletedBeforeSetup).toEqual([true, true]);
    expect(state.events).toEqual([
      `setup:a.yaml:${process.pid}`,
      `step:first:${process.pid}`,
      `step:second:${process.pid}`,
      `teardown:a.yaml:${process.pid}`,
      `setup:nested/b.yml:${process.pid}`,
      `step:third:${process.pid}`,
      `teardown:nested/b.yml:${process.pid}`,
    ]);
    expect(result).toMatchObject({
      status: 'failed',
      exitCode: 1,
      summary: {
        total: 3,
        passed: 2,
        failed: 1,
        notRun: 0,
        collectionErrors: 1,
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

    const projectResult = JSON.parse(
      readFileSync(join(resultDir, 'project.json'), 'utf8'),
    );
    expect(projectResult).toMatchObject({
      version: 3,
      fileSelection: { include: ['**/*.{yaml,yml}'] },
      status: 'failed',
      summary: result.summary,
      cases: [
        { status: 'failed', resultFile: expect.stringMatching(/^runs\//) },
        { status: 'success', resultFile: expect.stringMatching(/^runs\//) },
        { status: 'success', resultFile: expect.stringMatching(/^runs\//) },
      ],
      collectionErrors: [
        { sourcePath: 'z-invalid.yaml', errorFile: expect.any(String) },
      ],
    });
  });

  it('marks every case not run when beforeAll fails and still cleans up', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const state = setRunnerState(resultDir);
    writeFileSync(
      join(root, 'midscene.workflow.config.cjs'),
      `
        const state = globalThis.__workflowRunnerState;
        module.exports = {
          nodes: [
            { name: 'body', execute() { state.events.push('body'); } },
            {
              name: 'before.fail',
              execute() {
                state.events.push('beforeAll');
                throw new Error('beforeAll failed');
              },
            },
            {
              name: 'after',
              execute() { state.events.push('afterAll'); },
            },
          ],
          setupDocument({ onTeardown }) {
            state.events.push('setupDocument');
            onTeardown(() => state.events.push('teardown'));
          },
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

    const result = await runWorkflowProject({ projectRoot: root, resultDir });

    expect(state.events).toEqual([
      'setupDocument',
      'beforeAll',
      'afterAll',
      'teardown',
    ]);
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
      expect(() => parseWorkflowCliArgs([option], '/workspace')).toThrow(
        `Unknown option: ${option}`,
      );
    }
    expect(parseWorkflowCliArgs(['project'], '/workspace')).toEqual({
      cwd: '/workspace',
      projectRoot: '/workspace/project',
      configPath: undefined,
      resultDir: undefined,
    });
    expect(parseWorkflowCliArgs([], '/workspace')).toEqual({
      cwd: '/workspace',
      projectRoot: undefined,
      configPath: undefined,
      resultDir: undefined,
    });
  });
});
