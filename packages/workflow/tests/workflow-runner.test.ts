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
    mkdirSync(join(root, 'nested'));
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'z.yml'), 'cases: []');
    writeFileSync(join(root, 'nested', 'a.yaml'), 'cases: []');
    writeFileSync(join(root, 'node_modules', 'ignored.yaml'), 'cases: []');
    writeFileSync(join(root, 'notes.txt'), 'not yaml');

    expect(
      discoverWorkflowFiles(root).map((file) => file.slice(root.length + 1)),
    ).toEqual(['nested/a.yaml', 'z.yml']);
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
      version: 2,
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
          nodes: [{ name: 'body', execute() { state.events.push('body'); } }],
          documentNodes: [
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
      projectRoot: '/workspace/project',
      configPath: undefined,
      resultDir: undefined,
    });
  });
});
