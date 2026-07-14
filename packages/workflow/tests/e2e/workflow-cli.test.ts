import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const jsonFilesBelow = (directory: string): string[] => {
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.json')) files.push(path);
    }
  };
  visit(directory);
  return files;
};

describe('midscene-workflow CLI', () => {
  it('runs every workflow file in a project directory through Rstest', async () => {
    const packageRoot = resolve(__dirname, '../..');
    const projectRoot = join(__dirname, 'fixtures', 'workflow-project');
    const temporary = mkdtempSync(join(tmpdir(), 'midscene-workflow-e2e-'));
    temporaryDirectories.push(temporary);
    const resultDir = join(temporary, 'results');
    const executionLog = join(temporary, 'executed.log');

    const execution = await execFileAsync(
      process.execPath,
      [
        join(packageRoot, 'bin', 'midscene-workflow'),
        projectRoot,
        '--result-dir',
        resultDir,
      ],
      {
        cwd: packageRoot,
        env: { ...process.env, WORKFLOW_E2E_LOG: executionLog },
      },
    );

    expect(execution.stdout).toContain('3/3 workflows passed');
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'first:one',
      'first:two',
      'second:one',
      'nested:one',
      'nested:two',
    ]);
    expect(jsonFilesBelow(join(resultDir, 'runs'))).toHaveLength(3);
    expect(jsonFilesBelow(join(resultDir, 'rstest-tests'))).toHaveLength(3);
  });

  it('injects an Agent through setupWorkflow and calls a model-free Midscene node', async () => {
    const packageRoot = resolve(__dirname, '../..');
    const projectRoot = join(__dirname, 'fixtures', 'midscene-context-project');
    const temporary = mkdtempSync(join(tmpdir(), 'midscene-context-e2e-'));
    temporaryDirectories.push(temporary);
    const resultDir = join(temporary, 'results');
    const executionLog = join(temporary, 'executed.log');

    const execution = await execFileAsync(
      process.execPath,
      [
        join(packageRoot, 'bin', 'midscene-workflow'),
        projectRoot,
        '--result-dir',
        resultDir,
      ],
      {
        cwd: packageRoot,
        env: { ...process.env, WORKFLOW_E2E_LOG: executionLog },
      },
    );

    expect(execution.stdout).toContain('1/1 workflows passed');
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'setup:1:report-only workflow',
      'record:1:Ready:Agent came from setupWorkflow',
      'teardown:1:report-only workflow',
    ]);

    const [runResultPath] = jsonFilesBelow(join(resultDir, 'runs'));
    const runResult = JSON.parse(readFileSync(runResultPath, 'utf8'));
    expect(runResult).toMatchObject({
      status: 'success',
      steps: [
        {
          node: 'recordToReport',
          output: { summary: 'Recorded to report: Ready' },
        },
      ],
    });
  });

  it('creates a new setup context and tears down every retry attempt', async () => {
    const packageRoot = resolve(__dirname, '../..');
    const projectRoot = join(__dirname, 'fixtures', 'midscene-context-project');
    const temporary = mkdtempSync(join(tmpdir(), 'midscene-retry-e2e-'));
    temporaryDirectories.push(temporary);
    const resultDir = join(temporary, 'results');
    const executionLog = join(temporary, 'executed.log');

    const execution = await execFileAsync(
      process.execPath,
      [
        join(packageRoot, 'bin', 'midscene-workflow'),
        projectRoot,
        '--retry',
        '1',
        '--result-dir',
        resultDir,
      ],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          WORKFLOW_E2E_LOG: executionLog,
          WORKFLOW_E2E_FAIL_FIRST: '1',
        },
      },
    );

    expect(execution.stdout).toContain('1/1 workflows passed');
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'setup:1:report-only workflow',
      'record:1:Ready:Agent came from setupWorkflow',
      'teardown:1:report-only workflow',
      'setup:2:report-only workflow',
      'record:2:Ready:Agent came from setupWorkflow',
      'teardown:2:report-only workflow',
    ]);

    const runResults = jsonFilesBelow(join(resultDir, 'runs')).map((path) =>
      JSON.parse(readFileSync(path, 'utf8')),
    );
    expect(runResults).toHaveLength(2);
    expect(runResults.map((result) => result.status).sort()).toEqual([
      'failed',
      'success',
    ]);
    expect(new Set(runResults.map((result) => result.runId)).size).toBe(2);
  });
});
