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
const packageRoot = resolve(__dirname, '../..');
const cliPath = join(packageRoot, 'bin', 'midscene-workflow');

interface FailedExecution {
  code: number;
  stdout: string;
  stderr: string;
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const jsonFilesBelow = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
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

const temporaryRun = (prefix: string) => {
  const temporary = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(temporary);
  return {
    resultDir: join(temporary, 'results'),
    executionLog: join(temporary, 'executed.log'),
  };
};

const runFailure = async (
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<FailedExecution> => {
  try {
    await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: packageRoot,
      env,
    });
  } catch (error) {
    return error as FailedExecution;
  }
  throw new Error('Expected workflow CLI to fail.');
};

describe('midscene-workflow CLI', () => {
  it('runs all workflow documents serially and writes native project results', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'workflow-project');
    const { resultDir, executionLog } = temporaryRun('midscene-workflow-e2e-');

    const execution = await execFileAsync(
      process.execPath,
      [cliPath, projectRoot, '--result-dir', resultDir],
      {
        cwd: packageRoot,
        env: { ...process.env, WORKFLOW_E2E_LOG: executionLog },
      },
    );

    expect(execution.stdout).toContain(
      '3/3 workflows passed, 0 failed, 0 not run',
    );
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'first:one',
      'first:two',
      'second:one',
      'nested:one',
      'nested:two',
    ]);
    expect(jsonFilesBelow(join(resultDir, 'runs'))).toHaveLength(3);
    expect(jsonFilesBelow(join(resultDir, 'documents'))).toHaveLength(2);
    expect(existsSync(join(resultDir, 'project.json'))).toBe(true);
    expect(existsSync(join(resultDir, 'manifest.json'))).toBe(false);
    expect(existsSync(join(resultDir, 'rstest-tests'))).toBe(false);

    const projectResult = JSON.parse(
      readFileSync(join(resultDir, 'project.json'), 'utf8'),
    );
    expect(projectResult).toMatchObject({
      status: 'success',
      exitCode: 0,
      summary: {
        total: 3,
        passed: 3,
        failed: 0,
        notRun: 0,
        collectionErrors: 0,
        documentFailures: 0,
      },
    });
  });

  it('shares one setupDocument Agent with lifecycle nodes in the CLI process', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'midscene-context-project');
    const { resultDir, executionLog } = temporaryRun('midscene-context-e2e-');

    const execution = await execFileAsync(
      process.execPath,
      [cliPath, projectRoot, '--result-dir', resultDir],
      {
        cwd: packageRoot,
        env: { ...process.env, WORKFLOW_E2E_LOG: executionLog },
      },
    );

    expect(execution.stdout).toContain('1/1 workflows passed');
    const lines = readFileSync(executionLog, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(9);
    const pid = lines[0].split(':')[1];
    expect(lines[0]).toBe(`config:${pid}`);
    expect(lines[1]).toBe(`setupDocument:1:report.yaml:${pid}`);
    expect(lines[2]).toBe(`beforeAll:1:${pid}`);
    expect(lines[3]).toMatch(new RegExp(`^beforeEach:1:1:.+:${pid}$`));
    expect(lines.slice(4)).toEqual([
      `record:1:1:Attempt started:Shared document Agent:${pid}`,
      `record:1:1:Ready:Agent came from setupDocument:${pid}`,
      `record:1:1:Attempt finished:Shared document Agent:${pid}`,
      `afterAll:1:${pid}`,
      `documentTeardown:1:1:${pid}`,
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
  });

  it('continues later workflows and documents after a workflow fails', async () => {
    const projectRoot = join(
      __dirname,
      'fixtures',
      'failure-continuation-project',
    );
    const { resultDir, executionLog } = temporaryRun('midscene-failure-e2e-');

    const failure = await runFailure([projectRoot, '--result-dir', resultDir], {
      ...process.env,
      WORKFLOW_E2E_LOG: executionLog,
    });

    expect(failure.code).toBe(1);
    expect(failure.stdout).toContain(
      '2/3 workflows passed, 1 failed, 0 not run',
    );
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'first:failed',
      'second:passed',
      'third:passed',
    ]);
    const projectResult = JSON.parse(
      readFileSync(join(resultDir, 'project.json'), 'utf8'),
    );
    expect(
      projectResult.workflows.map(
        (workflow: { status: string }) => workflow.status,
      ),
    ).toEqual(['failed', 'success', 'success']);
  });

  it('runs afterAll and teardown after beforeAll fails', async () => {
    const projectRoot = join(
      __dirname,
      'fixtures',
      'before-all-failure-project',
    );
    const { resultDir, executionLog } = temporaryRun(
      'midscene-before-all-e2e-',
    );

    const failure = await runFailure([projectRoot, '--result-dir', resultDir], {
      ...process.env,
      WORKFLOW_E2E_LOG: executionLog,
    });

    expect(failure.code).toBe(1);
    expect(failure.stdout).toContain(
      '0/1 workflows passed, 0 failed, 1 not run',
    );
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'setupDocument',
      'beforeAll',
      'afterAll',
      'documentTeardown',
    ]);
    expect(jsonFilesBelow(join(resultDir, 'runs'))).toHaveLength(0);
    const [documentResultPath] = jsonFilesBelow(join(resultDir, 'documents'));
    const documentResult = JSON.parse(readFileSync(documentResultPath, 'utf8'));
    expect(documentResult.status).toBe('failed');
    expect(documentResult.beforeAll[0].error.message).toContain(
      'controlled beforeAll failure',
    );
    expect(documentResult.afterAll[0].status).toBe('success');
    const projectResult = JSON.parse(
      readFileSync(join(resultDir, 'project.json'), 'utf8'),
    );
    expect(projectResult.workflows).toEqual([
      expect.objectContaining({
        status: 'not-run',
        notRunReason: 'document-start-failed',
      }),
    ]);
  });

  it('rejects non-serial scheduling flags', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'workflow-project');
    for (const option of [
      '--parallel',
      '--max-concurrency',
      '--retry',
      '--bail',
    ]) {
      const failure = await runFailure([projectRoot, option]);
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain(`Unknown option: ${option}`);
    }
  });

  it('finishes the active document and marks remaining workflows interrupted', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'interrupt-project');
    const { resultDir, executionLog } = temporaryRun('midscene-interrupt-e2e-');

    const failure = await runFailure([projectRoot, '--result-dir', resultDir], {
      ...process.env,
      WORKFLOW_E2E_LOG: executionLog,
    });

    expect(failure.code).toBe(1);
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'setup:a.yaml',
      'interrupt',
      'teardown:a.yaml',
    ]);
    const projectResult = JSON.parse(
      readFileSync(join(resultDir, 'project.json'), 'utf8'),
    );
    expect(projectResult.workflows).toEqual([
      expect.objectContaining({ name: 'active workflow', status: 'success' }),
      expect.objectContaining({
        name: 'skipped workflow',
        status: 'not-run',
        notRunReason: 'interrupted',
      }),
      expect.objectContaining({
        name: 'skipped document workflow',
        status: 'not-run',
        notRunReason: 'interrupted',
      }),
    ]);
    expect(projectResult.documents).toHaveLength(1);
  });
});
