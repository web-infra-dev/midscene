import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestRunResult } from '@rstest/core/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWorkflowCliArgs } from '../src/cli/workflow-command';
import {
  discoverWorkflowFiles,
  runWorkflowProject,
} from '../src/cli/workflow-runner';

const directories: string[] = [];
const createProject = () => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-workflow-cli-'));
  directories.push(root);
  mkdirSync(join(root, 'nested'));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'z.yml'), 'workflows: []');
  writeFileSync(join(root, 'nested', 'a.yaml'), 'workflows: []');
  writeFileSync(join(root, 'node_modules', 'ignored.yaml'), 'workflows: []');
  writeFileSync(join(root, 'notes.txt'), 'not yaml');
  writeFileSync(
    join(root, 'midscene.workflow.config.cjs'),
    'module.exports = { nodes: [] };',
  );
  return root;
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const successfulResult = (): TestRunResult =>
  ({
    ok: true,
    files: [],
    stats: {
      tests: { total: 2, passed: 2, failed: 0, skipped: 0, todo: 0 },
      files: { total: 1, failed: 0 },
    },
    unhandledErrors: [],
    duration: { total: 1 },
  }) as TestRunResult;

describe('workflow CLI runner', () => {
  it('discovers YAML recursively in deterministic order', () => {
    const root = createProject();
    expect(
      discoverWorkflowFiles(root).map((file) => file.slice(root.length + 1)),
    ).toEqual(['nested/a.yaml', 'z.yml']);
  });

  it('writes a serial manifest and invokes the fixed bridge through runRstest', async () => {
    const root = createProject();
    const resultDir = join(root, 'results');
    const bridgePath = join(root, 'fixed-bridge.test.js');
    writeFileSync(bridgePath, '');
    const runRstest = vi.fn().mockResolvedValue(successfulResult());

    const result = await runWorkflowProject({
      projectRoot: root,
      resultDir,
      bridgePath,
      retry: 2,
      runRstest,
    });

    expect(result.exitCode).toBe(0);
    expect(result.manifest).toMatchObject({
      version: 1,
      mode: 'serial',
      retry: 2,
      resultDir,
      sources: [{ sourcePath: 'nested/a.yaml' }, { sourcePath: 'z.yml' }],
    });
    expect(runRstest).toHaveBeenCalledWith({
      cwd: root,
      files: [bridgePath],
      inlineConfig: expect.objectContaining({
        root,
        include: [bridgePath],
        exclude: [],
        testEnvironment: 'node',
        testTimeout: 0,
        retry: 2,
        pool: { maxWorkers: 1, minWorkers: 1 },
        env: { MIDSCENE_WORKFLOW_MANIFEST: result.manifestPath },
      }),
    });
  });

  it('parses workflow scheduling options', () => {
    expect(
      parseWorkflowCliArgs(
        [
          'project',
          '--parallel',
          '--max-concurrency',
          '3',
          '--retry',
          '2',
          '--bail',
          '1',
        ],
        '/workspace',
      ),
    ).toEqual({
      projectRoot: '/workspace/project',
      mode: 'parallel',
      maxConcurrency: 3,
      retry: 2,
      bail: 1,
      configPath: undefined,
      resultDir: undefined,
    });
  });
});
