import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
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
    expect(jsonFilesBelow(join(resultDir, 'documents'))).toHaveLength(2);
    expect(jsonFilesBelow(join(resultDir, 'rstest-tests'))).toHaveLength(3);
  });

  it('shares a setupDocument Agent across lifecycle nodes without a model', async () => {
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
    const lines = readFileSync(executionLog, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('setupDocument:1:report.yaml');
    expect(lines[1]).toBe('beforeAll:1');
    expect(lines[2]).toMatch(/^beforeEach:1:1:.+$/);
    expect(lines.slice(3)).toEqual([
      'record:1:1:Attempt started:Shared document Agent',
      'record:1:1:Ready:Agent came from setupDocument',
      'record:1:1:Attempt finished:Shared document Agent',
      'afterAll:1',
      'documentTeardown:1:1',
    ]);

    const [runResultPath] = jsonFilesBelow(join(resultDir, 'runs'));
    const runResult = JSON.parse(readFileSync(runResultPath, 'utf8'));
    expect(runResult).toMatchObject({
      status: 'success',
      beforeEach: [
        { node: 'attempt.start', phase: 'beforeEach' },
        { node: 'recordToReport', phase: 'beforeEach' },
      ],
      steps: [
        {
          node: 'recordToReport',
          phase: 'steps',
          output: { summary: 'Recorded to report: Ready' },
        },
      ],
      afterEach: [{ node: 'recordToReport', phase: 'afterEach' }],
    });
    const [documentResultPath] = jsonFilesBelow(join(resultDir, 'documents'));
    const documentResult = JSON.parse(readFileSync(documentResultPath, 'utf8'));
    expect(documentResult).toMatchObject({
      status: 'success',
      beforeAll: [{ phase: 'beforeAll' }],
      afterAll: [{ phase: 'afterAll' }],
    });
  });

  it('retries attempt hooks with new runIds and one document context', async () => {
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
    const lines = readFileSync(executionLog, 'utf8').trim().split('\n');
    expect(lines[0]).toBe('setupDocument:1:report.yaml');
    expect(lines[1]).toBe('beforeAll:1');
    expect(lines[2]).toMatch(/^beforeEach:1:1:.+$/);
    expect(lines[3]).toBe('record:1:1:Attempt started:Shared document Agent');
    expect(lines[4]).toBe('record:1:1:Ready:Agent came from setupDocument');
    expect(lines[5]).toBe('record:1:1:Attempt finished:Shared document Agent');
    expect(lines[6]).toMatch(/^beforeEach:1:2:.+$/);
    expect(lines.slice(7)).toEqual([
      'record:1:2:Attempt started:Shared document Agent',
      'record:1:2:Ready:Agent came from setupDocument',
      'record:1:2:Attempt finished:Shared document Agent',
      'afterAll:1',
      'documentTeardown:1:2',
    ]);
    expect(lines[2].split(':')[3]).not.toBe(lines[6].split(':')[3]);

    const runResults = jsonFilesBelow(join(resultDir, 'runs')).map((path) =>
      JSON.parse(readFileSync(path, 'utf8')),
    );
    expect(runResults).toHaveLength(2);
    expect(runResults.map((result) => result.status).sort()).toEqual([
      'failed',
      'success',
    ]);
    expect(new Set(runResults.map((result) => result.runId)).size).toBe(2);
    expect(jsonFilesBelow(join(resultDir, 'documents'))).toHaveLength(1);
  });

  it('runs Rstest afterAll and document teardown after beforeAll fails', async () => {
    const packageRoot = resolve(__dirname, '../..');
    const projectRoot = join(
      __dirname,
      'fixtures',
      'before-all-failure-project',
    );
    const temporary = mkdtempSync(join(tmpdir(), 'midscene-before-all-e2e-'));
    temporaryDirectories.push(temporary);
    const resultDir = join(temporary, 'results');
    const executionLog = join(temporary, 'executed.log');

    await expect(
      execFileAsync(
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
      ),
    ).rejects.toBeDefined();

    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'setupDocument',
      'beforeAll',
      'afterAll',
      'documentTeardown',
    ]);
    expect(existsSync(join(resultDir, 'runs'))).toBe(false);
    const [documentResultPath] = jsonFilesBelow(join(resultDir, 'documents'));
    const documentResult = JSON.parse(readFileSync(documentResultPath, 'utf8'));
    expect(documentResult.status).toBe('failed');
    expect(documentResult.beforeAll[0].error.message).toContain(
      'controlled beforeAll failure',
    );
    expect(documentResult.afterAll[0].status).toBe('success');
  });
});
